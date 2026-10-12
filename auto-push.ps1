# ISKCON Devotee Care - Automated Git Push & Vercel Trigger
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ISKCON DEVOTEE CARE - AUTOMATED GITHUB & VERCEL PUSH SYSTEM        " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$status = git status --porcelain
if ($status) {
    Write-Host "[!] Local changes detected:" -ForegroundColor Yellow
    git status -s
    Write-Host ""
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = Read-Host "Enter commit message (Press Enter for default 'auto: sync devotee portal updates $timestamp')"
    if ([string]::IsNullOrWhiteSpace($msg)) {
        $msg = "auto: sync devotee portal updates $timestamp"
    }

    Write-Host "[*] Staging files..." -ForegroundColor Gray
    git add .
    Write-Host "[*] Committing: '$msg'..." -ForegroundColor Gray
    git commit -m "$msg"
} else {
    Write-Host "[i] No uncommitted changes detected. Checking for unpushed commits..." -ForegroundColor Gray
}

Write-Host "[*] Syncing with remote repository (origin main)..." -ForegroundColor Gray
git pull --rebase origin main

Write-Host "[*] Pushing to GitHub (rothinroy0-ui/DEVOTEE-CARE)..." -ForegroundColor Gray
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Pushed to GitHub successfully!" -ForegroundColor Green
    Write-Host " - GitHub Repo:  https://github.com/rothinroy0-ui/DEVOTEE-CARE" -ForegroundColor Green
    Write-Host " - Vercel:       Automatically deploying latest code now!" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host " [ERROR] Git push failed. Please check your credentials or network." -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
}
