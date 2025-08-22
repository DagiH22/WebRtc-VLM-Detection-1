@echo off
set DURATION=%1
if "%DURATION%"=="" set DURATION=30

echo Running bench for %DURATION% seconds...

:: Wait for duration
timeout /t %DURATION% /nobreak >nul

:: Call Node.js collector
node bench\collect_metrics.js %DURATION%

echo ✅ Done. Check metrics.json
