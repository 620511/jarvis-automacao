# J.A.R.V.I.S. — Automação

Vigia o **PetDeliveryCE** e o **Farma.APP** no seu notebook, a cada 5 minutos:
- Testa se o site e a API estão no ar.
- Confere o último deploy na Vercel e no Render e o último teste (CI) no GitHub.
- Se algo quebrar: notificação do Windows, o Jarvis **fala em voz alta**, abre o painel `status.html`, e a IA explica as causas mais prováveis.
- Se você ativar: refaz o deploy no Render sozinho quando a API cair.

## PARTE A — Instalar (5 minutos)

1. Instale o **Node.js LTS** em https://nodejs.org (botão verde, avance até o fim).
2. Crie a pasta `C:\jarvis-automacao` (fora do OneDrive) e extraia o ZIP dentro dela.
3. Duplo clique em **`instalar.bat`**.
4. Responda as perguntas que aparecerem na janela preta (uma por vez, Enter pula):
   - Tokens: GitHub, Vercel, Render, Claude.
   - Para cada projeto: endereço do site, endereço da API, repositório, nome na Vercel, ID e Deploy Hook do Render.
5. Ele testa o aviso e a voz e abre o `status.html`. Tudo verde = funcionando.
6. Para deixar vigiando: duplo clique em **`iniciar-jarvis.bat`** (deixe a janela aberta).

Depois: para iniciar junto com o Windows, aperte Win+R, digite `shell:startup`, Enter, e coloque lá um atalho do `iniciar-jarvis.bat`.

### Onde achar cada dado
| Dado | Onde |
|---|---|
| Token GitHub | github.com > foto > Settings > Developer settings > Personal access tokens > Fine-grained. Permissões somente leitura: Actions, Contents, Metadata |
| Token Vercel | Account Settings > Tokens > Create |
| Chave Render | Account Settings > API Keys > Create |
| ID do serviço Render | Abra o serviço; o ID `srv-...` está na URL |
| Deploy Hook | Render > serviço > Settings > Deploy Hook |
| Chave Claude | console.anthropic.com > API Keys |

### Se algo der errado
- Sem notificação: Windows > Configurações > Sistema > Notificações > desligue o "Assistente de foco".
- Sem voz em português: Configurações > Hora e idioma > Fala > Adicionar vozes > Português (Brasil). Para desligar a voz: `VOICE=false` no `.env`.
- Alarme falso logo depois de acordar a API: no plano grátis o Render "dorme" e demora para responder.
- Refazer as respostas: `node configurar.mjs`.

## PARTE B — Subir para o GitHub

1. Entre em https://github.com/new
2. Repository name: `jarvis-automacao`. Marque **Private**. **Não** marque README, .gitignore nem license. Clique **Create repository**.
3. Copie o endereço que termina em `.git` (ex.: `https://github.com/620511/jarvis-automacao.git`).
4. Instale o **Git** em https://git-scm.com/download/win se ainda não tiver.
5. Duplo clique em **`subir-github.bat`**. Cole o endereço quando pedir. Na primeira vez abre uma janela para você entrar no GitHub.
6. Atualize a página do repositório: os arquivos devem aparecer.

Segurança: o `.env` (seus tokens) **nunca** sobe; o `subir-github.bat` aborta se ele não estiver protegido. O `config.json` sobe para o GitHub, então ele guarda só endereços e nomes. Tokens e Deploy Hooks ficam apenas no `.env`.

## Comandos úteis (PowerShell, dentro da pasta)
- `node jarvis-agent.mjs` — verifica uma vez
- `node jarvis-agent.mjs --watch` — vigia sem parar
- `node jarvis-agent.mjs --teste` — testa aviso e voz
- `node jarvis-agent.mjs --report` — relatório falado

## Arquivos
`jarvis-agent.mjs` (o agente) · `configurar.mjs` (perguntas) · `config.json` · `.env.example` · `instalar.bat` · `iniciar-jarvis.bat` · `subir-github.bat` · `painel-jarvis.html` (painel visual; o chat só funciona dentro do Claude)
