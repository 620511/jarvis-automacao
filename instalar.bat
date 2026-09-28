@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
node configurar.mjs
echo.
echo Testando aviso e voz do Jarvis...
node jarvis-agent.mjs --teste
echo.
echo Verificando seus projetos...
node jarvis-agent.mjs
start "" status.html
echo.
echo Tudo certo. Para deixar o Jarvis vigiando, de duplo clique em iniciar-jarvis.bat
pause
