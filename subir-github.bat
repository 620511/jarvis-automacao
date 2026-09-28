@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
where git >nul 2>&1
if errorlevel 1 (
  echo Git nao encontrado. Instale em https://git-scm.com/download/win e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist .git (
  git init
  git branch -M main
)
git check-ignore -q .env
if errorlevel 1 (
  echo ERRO: o .env nao esta protegido pelo .gitignore. Abortando por seguranca.
  pause
  exit /b 1
)
set "GITMAIL="
for /f "delims=" %%i in ('git config user.email') do set "GITMAIL=%%i"
if not defined GITMAIL (
  set /p "GITNAME=Seu nome: "
  set /p "GITMAIL=Seu e-mail do GitHub: "
  git config --global user.name "!GITNAME!"
  git config --global user.email "!GITMAIL!"
)
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo.
  echo Cole o endereco do repositorio vazio que voce criou no GitHub
  echo Exemplo: https://github.com/620511/jarvis-automacao.git
  set /p "REPO=Endereco: "
  git remote add origin "!REPO!"
)
git add .
git commit -m "Jarvis automacao"
git push -u origin main
if errorlevel 1 (
  echo.
  echo Falhou. Leia a mensagem acima. Confira se o repositorio existe e esta vazio.
) else (
  echo.
  echo Enviado com sucesso para o GitHub!
)
pause
