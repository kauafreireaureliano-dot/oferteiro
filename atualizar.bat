@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 1/2 Coletando ofertas (nao feche a janela do Chrome) ===
cd scraper
node swipe.js %*
cd ..
echo.
set /p SUBIR="=== 2/2 Enviar para o dashboard (GitHub/Vercel)? (s/n): "
if /i "%SUBIR%"=="s" (
  git add public/data.json
  git commit -m "Atualiza ofertas"
  git push
  echo Enviado. A Vercel publica em ~1 minuto.
)
pause
