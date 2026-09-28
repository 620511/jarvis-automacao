#!/usr/bin/env node
// J.A.R.V.I.S. Agent — monitoramento + automação (Node 18+, sem dependências)
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleString("pt-BR"), "|", ...a);

function loadEnv() {
  const f = path.join(DIR, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const E = process.env;
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const STATE_FILE = path.join(DIR, "state.json");
const AUTO_HEAL = E.AUTO_HEAL === "true";
const INTERVAL_MIN = Number(E.INTERVAL_MIN || 5);
const HEAL_COOLDOWN_MIN = 30;

// ---------- HTTP ----------
async function req(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
async function getJson(url, headers) {
  const r = await req(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- Verificações ----------
async function checkUrl({ label, url }) {
  let last;
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    try {
      const r = await req(url, { headers: { "User-Agent": "jarvis-agent" } });
      last = { label, url, ok: r.status < 400, status: r.status, ms: Date.now() - t0 };
      if (last.ok) return last;
    } catch (e) {
      last = { label, url, ok: false, status: 0, ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout" : e.message };
    }
    await sleep(3000);
  }
  return last;
}

async function githubInfo(repo) {
  if (!repo || !E.GITHUB_TOKEN) return null;
  const h = { Authorization: `Bearer ${E.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "jarvis-agent" };
  const out = {};
  const runs = await getJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=1`, h);
  const run = runs.workflow_runs?.[0];
  out.lastRun = run ? { name: run.name, conclusion: run.conclusion || run.status } : null;
  const commits = await getJson(`https://api.github.com/repos/${repo}/commits?per_page=1`, h);
  out.lastCommit = commits[0] ? `${commits[0].commit.message.split("\n")[0]} (${commits[0].commit.author.date.slice(0, 10)})` : null;
  const info = await getJson(`https://api.github.com/repos/${repo}`, h);
  out.openIssues = info.open_issues_count;
  return out;
}

async function vercelInfo(project) {
  if (!project || !E.VERCEL_TOKEN) return null;
  const team = E.VERCEL_TEAM_ID ? `&teamId=${E.VERCEL_TEAM_ID}` : "";
  const d = await getJson(`https://api.vercel.com/v6/deployments?app=${encodeURIComponent(project)}&limit=1${team}`, {
    Authorization: `Bearer ${E.VERCEL_TOKEN}`,
  });
  const x = d.deployments?.[0];
  return x ? { state: x.state, url: x.url } : null;
}

async function renderInfo(serviceId) {
  if (!serviceId || !E.RENDER_API_KEY) return null;
  const a = await getJson(`https://api.render.com/v1/services/${serviceId}/deploys?limit=1`, {
    Authorization: `Bearer ${E.RENDER_API_KEY}`,
    Accept: "application/json",
  });
  const d = a[0]?.deploy ?? a[0];
  return d ? { status: d.status } : null;
}

async function checkProject(p) {
  const res = { name: p.name, urls: [], problems: [] };
  res.urls = await Promise.all((p.urls || []).filter((u) => u.url).map(checkUrl));
  for (const u of res.urls) if (!u.ok) res.problems.push(`${u.label} fora do ar (${u.error || "HTTP " + u.status})`);

  const safe = async (label, fn, arg) => {
    try {
      return await fn(arg);
    } catch (e) {
      res.problems.push(`Integração ${label} falhou: ${e.message}`);
      return null;
    }
  };
  res.github = await safe("GitHub", githubInfo, p.github);
  res.vercel = await safe("Vercel", vercelInfo, p.vercelProject);
  res.render = await safe("Render", renderInfo, p.renderServiceId);

  if (res.github?.lastRun && ["failure", "timed_out"].includes(res.github.lastRun.conclusion))
    res.problems.push(`GitHub Actions: último run "${res.github.lastRun.name}" = ${res.github.lastRun.conclusion}`);
  if (res.vercel?.state === "ERROR") res.problems.push("Vercel: último deploy falhou (ERROR)");
  if (res.render && ["build_failed", "update_failed", "pre_deploy_failed"].includes(res.render.status))
    res.problems.push(`Render: último deploy = ${res.render.status}`);
  return res;
}

// ---------- Ações ----------
const clean = (s) => String(s).replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, "").replace(/\s+/g, " ").trim();

function ps(script, env) {
  if (process.platform !== "win32") return;
  execFile("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], { env: { ...process.env, ...env }, windowsHide: true }, () => {});
}

async function notify(text, { speech = "", level = "info", open = false } = {}) {
  log(level === "alert" ? "🚨" : "🔔", text.replace(/\n/g, " | "));
  try {
    fs.appendFileSync(path.join(DIR, "alertas.log"), `[${new Date().toLocaleString("pt-BR")}] ${text}\n\n`);
  } catch {}

  // Notificação do Windows (canto inferior direito)
  const body = clean(text.split("\n\n")[0]).slice(0, 240);
  ps(
    `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing;
$n = New-Object System.Windows.Forms.NotifyIcon;
$n.Icon = if ($env:J_LEVEL -eq 'alert') { [System.Drawing.SystemIcons]::Error } else { [System.Drawing.SystemIcons]::Information };
$n.BalloonTipTitle = 'J.A.R.V.I.S.'; $n.BalloonTipText = $env:J_BODY; $n.Visible = $true;
$n.ShowBalloonTip(10000); Start-Sleep -Seconds 11; $n.Dispose()`,
    { J_BODY: body, J_LEVEL: level }
  );

  // Jarvis fala em voz alta
  if (speech && E.VOICE !== "false") {
    ps(
      `Add-Type -AssemblyName System.Speech;
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'pt*' } | Select-Object -First 1;
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };
$s.Speak($env:J_SPEECH)`,
      { J_SPEECH: clean(speech) }
    );
  }

  // Abre o painel de status no navegador
  if (open) openPanel();
}

function openPanel() {
  if (E.OPEN_PANEL_ON_ALERT === "false" || process.platform !== "win32") return;
  execFile("cmd", ["/c", "start", "", path.join(DIR, "status.html")], { windowsHide: true }, () => {});
}

async function diagnose(name, problems) {
  if (!E.ANTHROPIC_API_KEY) return "";
  try {
    const r = await req(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": E.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: E.ANTHROPIC_MODEL || "claude-sonnet-5",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: `Você é o Jarvis, engenheiro de confiabilidade do George. O projeto ${name} (React/Vite na Vercel, Express+Prisma no Render, Supabase Postgres) apresentou:\n- ${problems.join("\n- ")}\nDê em português as 3 causas mais prováveis e o primeiro passo de verificação de cada uma. Seja curto.`,
            },
          ],
        }),
      },
      45000
    );
    const d = await r.json();
    return (d.content || []).map((c) => c.text || "").join("");
  } catch {
    return "";
  }
}

async function heal(p, state) {
  const hook = p.renderDeployHook || E[p.renderDeployHookEnv || ""];
  if (!AUTO_HEAL || !hook) return false;
  const last = state[p.name]?.lastHeal || 0;
  if (Date.now() - last < HEAL_COOLDOWN_MIN * 60000) return false;
  try {
    const r = await req(hook, { method: "POST" });
    state[p.name] = { ...(state[p.name] || {}), lastHeal: Date.now() };
    return r.ok;
  } catch {
    return false;
  }
}

// ---------- Relatórios ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function summary(results) {
  return (
    "📋 Relatório do Jarvis\n" +
    results
      .map((r) => {
        const urls = r.urls.map((u) => `${u.ok ? "🟢" : "🔴"} ${u.label} ${u.ms}ms`).join(" · ");
        const extra = [
          r.vercel && `Vercel: ${r.vercel.state}`,
          r.render && `Render: ${r.render.status}`,
          r.github?.lastRun && `CI: ${r.github.lastRun.conclusion}`,
          r.github && `issues abertas: ${r.github.openIssues}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return `\n${r.problems.length ? "🔴" : "🟢"} ${r.name}\n${urls}${extra ? "\n" + extra : ""}`;
      })
      .join("\n")
  );
}

function writeReport(results) {
  let tail = "";
  try {
    tail = fs.readFileSync(path.join(DIR, "alertas.log"), "utf8").slice(-3500);
  } catch {}
  const rows = results
    .map(
      (r) => `<section><h2>${r.problems.length ? "🔴" : "🟢"} ${esc(r.name)}</h2>
<ul>${r.urls.map((u) => `<li>${u.ok ? "🟢" : "🔴"} ${esc(u.label)} — ${esc(u.url)} — ${u.status} — ${u.ms}ms${u.error ? " — " + esc(u.error) : ""}</li>`).join("")}</ul>
${r.problems.length ? `<p><b>Problemas:</b></p><ul>${r.problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
<pre>${esc(JSON.stringify({ github: r.github, vercel: r.vercel, render: r.render }, null, 2))}</pre></section>`
    )
    .join("");
  fs.writeFileSync(
    path.join(DIR, "status.html"),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="60"><title>Jarvis Status</title>
<body style="font-family:sans-serif;background:#0b1220;color:#e7edf5;padding:20px"><h1>J.A.R.V.I.S. — Status</h1>
<p>Atualizado: ${new Date().toLocaleString("pt-BR")}</p>${rows}${tail ? `<h2>Últimos alertas</h2><pre style="white-space:pre-wrap">${esc(tail)}</pre>` : ""}</body>`
  );
}

// ---------- Ciclo principal ----------
async function cycle({ report = false } = {}) {
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  const results = [];
  let newAlert = false;
  for (const p of CONFIG.projects) {
    const r = await checkProject(p);
    const sig = [...r.problems].sort().join("|");
    const prev = state[p.name]?.sig || "";
    if (sig !== prev) {
      if (r.problems.length) {
        newAlert = true;
        let msg = `🚨 ${p.name}\n- ${r.problems.join("\n- ")}`;
        let spoken = `Senhor George, atenção. ${p.name} apresenta ${r.problems.length > 1 ? r.problems.length + " problemas" : "um problema"}. ${r.problems[0]}.`;
        const healDown = (p.urls || []).some((u) => u.heal && r.urls.some((x) => x.url === u.url && !x.ok));
        if (healDown && (await heal(p, state))) {
          msg += "\n🔧 Redeploy automático disparado no Render.";
          spoken += " Já disparei um novo deploy no Render.";
        }
        const dx = await diagnose(p.name, r.problems);
        if (dx) msg += `\n\n🧠 Diagnóstico:\n${dx}`;
        await notify(msg, { speech: spoken, level: "alert" });
      } else {
        await notify(`✅ ${p.name} normalizado.`, { speech: `${p.name} voltou ao normal, senhor.` });
      }
    }
    state[p.name] = { ...(state[p.name] || {}), sig };
    results.push(r);
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  writeReport(results);
  if (newAlert) openPanel();
  if (report) {
    const bad = results.filter((r) => r.problems.length).length;
    await notify(summary(results), {
      speech: bad ? `Relatório pronto. ${bad} de ${results.length} projetos com problema.` : `Relatório pronto. Todos os ${results.length} projetos estão operando normalmente.`,
    });
  }
  return results;
}

const args = process.argv.slice(2);
if (args.includes("--teste")) {
  await notify("🚨 Teste do Jarvis\n- Se você viu este aviso e ouviu minha voz, está tudo funcionando.", {
    speech: "Senhor George, teste concluído. Estou operacional.",
    level: "alert",
  });
  await sleep(12000);
} else if (args.includes("--watch")) {
  log(`Jarvis vigiando a cada ${INTERVAL_MIN} min. Ctrl+C para parar.`);
  await notify("🤖 Jarvis online e vigiando seus projetos.", { speech: "Jarvis online. Vigiando seus projetos, senhor." });
  for (;;) {
    try {
      await cycle();
    } catch (e) {
      log("Erro no ciclo:", e.message);
    }
    await sleep(INTERVAL_MIN * 60000);
  }
} else {
  await cycle({ report: args.includes("--report") });
  log("Ciclo concluído. Abra status.html para ver o painel.");
}
