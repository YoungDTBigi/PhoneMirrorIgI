# Buduje PhoneMirror.exe na Windowsie. Uruchom w PowerShellu:
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$msys = if ($env:MSYS2_ROOT) { $env:MSYS2_ROOT } else { 'C:\msys64' }

function Need($what, $wingetId, $test) {
  if (& $test) { return }
  Write-Host "==> Brak: $what. Instaluję przez winget..." -ForegroundColor Yellow
  winget install -e --id $wingetId --accept-package-agreements --accept-source-agreements
  if (-not (& $test)) { throw "Zainstaluj $what ręcznie i uruchom skrypt ponownie." }
}

Need 'MSYS2' 'MSYS2.MSYS2' { Test-Path "$msys\usr\bin\bash.exe" }
Need 'Node.js' 'OpenJS.NodeJS.LTS' {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  [bool](Get-Command npm -ErrorAction SilentlyContinue)
}

Write-Host "==> 1/2 Silnik AirPlay (UxPlay + GStreamer)" -ForegroundColor Cyan
$env:MSYSTEM = 'UCRT64'; $env:CHERE_INVOKING = '1'
Push-Location $root
& "$msys\usr\bin\bash.exe" -lc "pacman -Sy --noconfirm >/dev/null; ./scripts/build-engine.sh"
if ($LASTEXITCODE -ne 0) { throw "Budowanie silnika nie powiodło się." }

Write-Host "==> 2/2 Aplikacja i instalator" -ForegroundColor Cyan
Push-Location "$root\app"
npm install
npm run dist
Pop-Location; Pop-Location

Write-Host ""
Write-Host "Gotowe! Pliki są w folderze dist:" -ForegroundColor Green
Get-ChildItem "$root\dist\*.exe" | ForEach-Object { Write-Host "  $($_.FullName)" }
