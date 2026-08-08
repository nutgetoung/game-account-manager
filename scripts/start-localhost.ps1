$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root "server.pid"
$logDir = Join-Path $root "logs"
$stdoutLog = Join-Path $logDir "server.log"
$stderrLog = Join-Path $logDir "server-error.log"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (Test-Path $pidFile) {
    $existingPid = [int](Get-Content $pidFile -Raw).Trim()
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
        Write-Host "Local host is already running (PID $existingPid) at http://localhost:3000"
        exit 0
    }
    Remove-Item $pidFile -Force
}

$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process `
    -FilePath $node `
    -ArgumentList "server.js" `
    -WorkingDirectory $root `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

$process.Id | Set-Content -Path $pidFile -NoNewline
Write-Host "Local host started at http://localhost:3000 (PID $($process.Id))"
Write-Host "Logs: $stdoutLog"