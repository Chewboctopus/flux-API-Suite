@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FLUX Studio (Web)
cd /d "%~dp0"

REM FLUX Studio - local web version launcher (Windows).
REM No admin rights needed: if Node.js 18+ isn't installed, a private copy is
REM downloaded into .\app\.runtime (verified against nodejs.org's published checksums).
REM Uses only tools built into Windows 10 1803+ (curl.exe, tar.exe, certutil).

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "APP=%ROOT%\app"
set "RUNTIME=%APP%\.runtime"
set "MIN_NODE=18"
if not defined FLUX_NODE_LINE set "FLUX_NODE_LINE=v24.x"

if not exist "%APP%\server.js" (
    echo.
    echo   [ERROR] The "app" folder is missing next to this launcher. Re-extract the zip.
    echo.
    pause
    exit /b 1
)

echo.
echo   ======================================
echo        FLUX Studio - Web Launcher
echo   ======================================
echo.

REM ---- 1. Find a usable Node.js ------------------------------------------------
set "NODE_EXE="
if not defined FLUX_FORCE_PORTABLE_NODE (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        for /f "tokens=1 delims=." %%a in ('node -v') do set "NV=%%a"
        set "NV=!NV:v=!"
        if !NV! geq %MIN_NODE% set "NODE_EXE=node"
    )
)

if not defined NODE_EXE if exist "%RUNTIME%\node\node.exe" (
    set "NODE_EXE=%RUNTIME%\node\node.exe"
    set "PATH=%RUNTIME%\node;!PATH!"
)

REM ---- 2. Otherwise download a private copy (no admin needed) -----------------
if not defined NODE_EXE (
    echo   Node.js %MIN_NODE%+ not found - downloading a private copy ^(one time, ~35 MB^)...
    echo.

    set "ARCH=x64"
    if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
    if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"

    set "BASE=https://nodejs.org/dist/latest-%FLUX_NODE_LINE%"
    set "DL=%RUNTIME%\_download"
    if exist "!DL!" rmdir /s /q "!DL!"
    mkdir "!DL!" >nul 2>nul

    curl.exe -fsSL "!BASE!/SHASUMS256.txt" -o "!DL!\SHASUMS256.txt"
    if errorlevel 1 (
        echo   [ERROR] Couldn't reach nodejs.org. Check your internet / proxy settings.
        goto :fail
    )

    set "WANT_HASH="
    set "ZIP_NAME="
    for /f "tokens=1,2" %%a in ('findstr /c:"-win-!ARCH!.zip" "!DL!\SHASUMS256.txt"') do (
        set "WANT_HASH=%%a"
        set "ZIP_NAME=%%b"
    )
    if not defined ZIP_NAME (
        echo   [ERROR] No Node.js build found for win-!ARCH!.
        goto :fail
    )

    curl.exe -fL --progress-bar "!BASE!/!ZIP_NAME!" -o "!DL!\!ZIP_NAME!"
    if errorlevel 1 (
        echo   [ERROR] Download failed.
        goto :fail
    )

    set "GOT_HASH="
    for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "!DL!\!ZIP_NAME!" SHA256') do (
        if not defined GOT_HASH set "GOT_HASH=%%h"
    )
    set "GOT_HASH=!GOT_HASH: =!"
    if /i not "!GOT_HASH!"=="!WANT_HASH!" (
        echo   [ERROR] Checksum mismatch on the Node.js download - aborting.
        goto :fail
    )

    if exist "%RUNTIME%\node" rmdir /s /q "%RUNTIME%\node"
    tar.exe -xf "!DL!\!ZIP_NAME!" -C "%RUNTIME%"
    if errorlevel 1 (
        echo   [ERROR] Couldn't unpack Node.js.
        goto :fail
    )
    for /d %%d in ("%RUNTIME%\node-v*") do ren "%%d" node
    rmdir /s /q "!DL!" >nul 2>nul

    if not exist "%RUNTIME%\node\node.exe" (
        echo   [ERROR] Node.js unpacked but node.exe was not found.
        goto :fail
    )
    set "NODE_EXE=%RUNTIME%\node\node.exe"
    set "PATH=%RUNTIME%\node;!PATH!"
    echo   [OK] Private Node.js ready.
)

for /f "delims=" %%v in ('"!NODE_EXE!" -v') do echo   [OK] Using Node.js %%v

REM ---- 3. Install web dependencies (express, multer - no Electron needed) ------
set "STAMP=%APP%\node_modules\.web-install-stamp"
set "CURRENT=none"
if exist "%APP%\package-lock.json" (
    set "CURRENT="
    for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "%APP%\package-lock.json" SHA256') do (
        if not defined CURRENT set "CURRENT=%%h"
    )
)

set "NEED_INSTALL=0"
if not exist "%APP%\node_modules\express" set "NEED_INSTALL=1"
if not exist "%APP%\node_modules\multer" set "NEED_INSTALL=1"
if "!NEED_INSTALL!"=="0" if exist "!STAMP!" (
    set "SAVED="
    set /p SAVED=<"!STAMP!"
    if not "!SAVED!"=="!CURRENT!" set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
    echo.
    echo   Installing dependencies ^(first run, or after an update^)...
    echo.
    pushd "%APP%"
    call npm install --omit=dev --no-audit --no-fund
    set "NPM_RC=!errorlevel!"
    popd
    if not "!NPM_RC!"=="0" (
        echo.
        echo   [ERROR] npm install failed. See messages above.
        goto :fail
    )
    >"!STAMP!" echo !CURRENT!
    echo.
    echo   [OK] Dependencies installed.
)

REM ---- 4. Launch ----------------------------------------------------------------
echo.
echo   Starting FLUX Studio...
"!NODE_EXE!" "%APP%\scripts\web-launch.mjs" %*
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo   Something went wrong - see the messages above.
echo.
pause
exit /b 1
