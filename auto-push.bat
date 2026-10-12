@echo off
setlocal enabledelayedexpansion
title DEVOTEE CARE - Automated GitHub Push & Vercel Deployer
color 0B

echo ======================================================================
echo    ISKCON DEVOTEE CARE - AUTOMATED GITHUB & VERCEL PUSH SYSTEM
echo ======================================================================
echo.

:: 1. Verify Git is available
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Git is not found in PATH. Please ensure Git is installed.
    echo.
    pause
    exit /b 1
)

:: 2. Check current repository status
echo [*] Checking working directory status...
cd /d "%~dp0"

git status --short > "%TEMP%\git_status_check.txt"
set /p STATUS_CHECK=<"%TEMP%\git_status_check.txt"
del "%TEMP%\git_status_check.txt" 2>nul

:: 3. Prompt for commit message or generate automated timestamp
set "DEFAULT_MSG=auto: sync devotee portal updates (%date% %time%)"
set "COMMIT_MSG="

if not "%STATUS_CHECK%"=="" (
    echo [!] Local changes detected:
    git status -s
    echo.
    set /p "COMMIT_MSG=Enter commit message (Press Enter for default '%DEFAULT_MSG%'): "
    if "!COMMIT_MSG!"=="" set "COMMIT_MSG=%DEFAULT_MSG%"
    
    echo.
    echo [*] Staging all modified and new files...
    git add .

    echo [*] Creating commit: "!COMMIT_MSG!"...
    git commit -m "!COMMIT_MSG!"
) else (
    echo [i] No new uncommitted file changes detected.
    echo [*] Checking if any unpushed commits exist...
)

:: 4. Pull remote changes safely to prevent rejection
echo.
echo [*] Syncing with remote repository (origin main)...
git pull --rebase origin main

:: 5. Push to GitHub
echo.
echo [*] Pushing latest code to GitHub repository (rothinroy0-ui/DEVOTEE-CARE)...
git push origin main

if %ERRORLEVEL% equ 0 (
    color 0A
    echo.
    echo ======================================================================
    echo  [SUCCESS] All changes successfully pushed to GitHub!
    echo.
    echo  - GitHub Repo:  https://github.com/rothinroy0-ui/DEVOTEE-CARE
    echo  - Vercel:       Automatically triggered deployment on Vercel!
    echo ======================================================================
) else (
    color 0C
    echo.
    echo ======================================================================
    echo  [ERROR] Push failed. Please check your internet connection or git status.
    echo ======================================================================
)

echo.
echo Press any key to close this window...
pause >nul
