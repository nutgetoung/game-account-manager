$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root "server.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "Local host is not running."
    exit 0
}

$serverPid = [int](Get-Content $pidFile -Raw).Trim()
$serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue

if ($serverProcess) {
    Stop-Process -Id $serverPid -Force
    Write-Host "Local host stopped (PID $serverPid)."
} else {
    Write-Host "Local host process was already stopped."
}

Remove-Item $pidFile -Force