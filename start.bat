@echo off
title FLUX Studio
echo.
echo  ╔══════════════════════════════════════╗
echo  ║          FLUX Studio Launcher        ║
echo  ╚══════════════════════════════════════╝
echo.

:: ── Check for Node.js ────────────────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Node.js is not installed.
    echo.
    echo  Attempting to install Node.js automatically...
    echo.
    where winget >nul 2>nul
    if %errorlevel% neq 0 (
        echo  [ERROR] Cannot auto-install: winget is not available on this system.
        echo.
        echo  Please install Node.js manually:
        echo    1. Go to https://nodejs.org
        echo    2. Download the LTS installer
        echo    3. Run the installer (accept all defaults)
        echo    4. Close this window and double-click start.bat again
        echo.
        pause
        exit /b 1
    )
    echo  Installing Node.js via winget (this may take a minute)...
    echo.
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Automatic install failed.
        echo  Please install Node.js manually from https://nodejs.org
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Node.js installed successfully.
    echo.
    echo  *** IMPORTANT: Close this window and double-click start.bat again ***
    echo  (The terminal needs to restart to pick up the new Node.js installation)
    echo.
    pause
    exit /b 0
)

:: ── Check Node.js version ────────────────────────────────────────────────────
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 18 (
    echo  [ERROR] Node.js version is too old.
    echo  Found: & node -v
    echo  Required: v18.0.0 or newer
    echo.
    echo  Download the latest LTS from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found: & node -v

:: ── Change to script directory ───────────────────────────────────────────────
cd /d "%~dp0"

:: ── Install dependencies if needed ───────────────────────────────────────────
if not exist "node_modules" (
    echo.
    echo  Installing dependencies (first run only)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] npm install failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed.
)

:: ── Start the server ─────────────────────────────────────────────────────────
echo.
echo  Starting FLUX Studio...
echo  Open your browser to: http://localhost:3000
echo.
echo  (Press Ctrl+C to stop the server)
echo.
node server.js
pause
