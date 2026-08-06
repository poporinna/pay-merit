$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$PythonCommand = $null
$PythonArgs = @()
$Python = (Get-Command python -ErrorAction SilentlyContinue)
if ($Python) {
  $PythonCommand = $Python.Source
} else {
  $LocalPython = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
  if (Test-Path $LocalPython) {
    $PythonCommand = $LocalPython
  } else {
    $PyLauncher = (Get-Command py -ErrorAction SilentlyContinue)
    if ($PyLauncher) {
      $PythonCommand = $PyLauncher.Source
      $PythonArgs = @("-3")
    }
  }
}
if (-not $PythonCommand) {
  throw "Python 3.12+ is required. Install it, then run: python -m pip install -r requirements.txt"
}

$GenvmLint = (Get-Command genvm-lint -ErrorAction SilentlyContinue)
if (-not $GenvmLint) {
  $ScriptsDir = & $PythonCommand @PythonArgs -c "import sysconfig; print(sysconfig.get_path('scripts'))"
  $Candidate = Join-Path $ScriptsDir "genvm-lint.exe"
  if (Test-Path $Candidate) {
    $GenvmLint = @{ Source = $Candidate }
  }
}
if (-not $GenvmLint) {
  throw "genvm-lint is required. Run: python -m pip install -r requirements.txt"
}

Write-Host "== GenVM lint =="
& $GenvmLint.Source check "backend/pay-merit.py" --json

Write-Host "== Direct contract tests =="
& $PythonCommand @PythonArgs -m pytest "tests" -v
