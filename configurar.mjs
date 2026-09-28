// Assistente de configuração do Jarvis — responde as perguntas e ele monta .env e config.json
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(DIR, ".env");
const CFG_FILE = path.join(DIR, "config.json");
const rl = readline.createInterface({ input: process.stdin });
const inputLines = rl[Symbol.asyncIterator]();
const readLine = async () => {
  const { value, done } = await inputLines.next();
  return done ? "" : value;
};

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const ask = async (q, def = "") => {
  const shown = def ? (def.length > 12 ? def.slice(0, 4) + "…" : def) : "";
  process.stdout.write(shown ? `${q} [Enter mantém: ${shown}]\n> ` : `${q} (Enter pula)\n> `);
  const a = (await readLine()).trim();
  return a || def;
};
const url = (v) => (v && !/^https?:\/\//i.test(v) ? "https://" + v : v);

const old = parseEnv(ENV_FILE);
const cfg = JSON.parse(fs.readFileSync(CFG_FILE, "utf8"));

console.log("\n=== Configuração do J.A.R.V.I.S. ===");
console.log("Responda uma pergunta por vez. Enter = pular. Você pode rodar de novo quando quiser.\n");

console.log("--- PARTE 1: tokens (cole e aperte Enter) ---\n");
const env = {
  GITHUB_TOKEN: await ask("Token do GitHub (github.com > Settings > Developer settings > Personal access tokens)", old.GITHUB_TOKEN),
  VERCEL_TOKEN: await ask("Token da Vercel (vercel.com > Account Settings > Tokens)", old.VERCEL_TOKEN),
  VERCEL_TEAM_ID: await ask("ID do time na Vercel (só se seus projetos ficam em um time; senão pule)", old.VERCEL_TEAM_ID),
  RENDER_API_KEY: await ask("Chave de API do Render (Account Settings > API Keys)", old.RENDER_API_KEY),
  ANTHROPIC_API_KEY: await ask("Chave do Claude para o diagnóstico (console.anthropic.com > API Keys)", old.ANTHROPIC_API_KEY),
};
const heal = (await ask("Refazer o deploy no Render sozinho quando a API cair? Digite s ou n", old.AUTO_HEAL === "true" ? "s" : "n")).toLowerCase().startsWith("s");

console.log("\n--- PARTE 2: seus projetos ---\n");
const hooks = {};
for (const p of cfg.projects) {
  console.log(`>>> ${p.name}`);
  const [front, api] = p.urls;
  front.url = url(await ask(`Endereço do site (Vercel), ex.: meuapp.vercel.app`, front.url));
  api.url = url(await ask(`Endereço da API (Render), ex.: minha-api.onrender.com/health`, api.url));
  p.github = await ask(`Repositório no GitHub, formato dono/repositorio`, p.github);
  p.vercelProject = await ask(`Nome do projeto na Vercel`, p.vercelProject);
  p.renderServiceId = await ask(`ID do serviço no Render (começa com srv-, está na URL do serviço)`, p.renderServiceId);
  const hookKey = p.renderDeployHookEnv;
  hooks[hookKey] = await ask(`Deploy Hook do Render (Settings > Deploy Hook). Fica só no .env, nunca no GitHub`, old[hookKey]);
  console.log("");
}
rl.close();

const lines = [
  "# Gerado pelo configurar.mjs. NUNCA suba este arquivo para o GitHub.",
  ...Object.entries({
    ...env,
    ANTHROPIC_MODEL: old.ANTHROPIC_MODEL || "claude-sonnet-5",
    VOICE: old.VOICE || "true",
    OPEN_PANEL_ON_ALERT: old.OPEN_PANEL_ON_ALERT || "true",
    AUTO_HEAL: String(heal),
    ...hooks,
    INTERVAL_MIN: old.INTERVAL_MIN || "5",
  }).map(([k, v]) => `${k}=${v || ""}`),
];
fs.writeFileSync(ENV_FILE, lines.join("\n") + "\n");
fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2) + "\n");
console.log("Pronto! Salvei .env e config.json.");
