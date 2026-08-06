$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendRoot = Join-Path $RepoRoot "frontend"
Set-Location $FrontendRoot

if (Test-Path "package-lock.json") {
  npm ci
} else {
  npm install
}

npm run build
