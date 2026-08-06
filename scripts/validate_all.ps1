$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot

& (Join-Path $ScriptRoot "validate_contract.ps1")
& (Join-Path $ScriptRoot "build_frontend.ps1")
