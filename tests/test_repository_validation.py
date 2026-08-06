from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIN = "# { \"Depends\": \"py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6\" }"


def test_contract_declares_the_working_genlayer_sdk_pin():
    contract = ROOT / "backend" / "pay-merit.py"
    first_line = contract.read_text(encoding="utf-8").splitlines()[0]
    assert first_line == PIN


def test_reproducible_validation_files_are_tracked():
    required = [
        "requirements.txt",
        "scripts/validate_contract.ps1",
        "scripts/build_frontend.ps1",
        "scripts/validate_all.ps1",
        ".github/workflows/validate.yml",
        "tests/test_ledger.py",
    ]
    for item in required:
        assert (ROOT / item).is_file(), f"missing {item}"


def test_ci_and_scripts_exercise_the_contract_workflow():
    workflow = (ROOT / ".github" / "workflows" / "validate.yml").read_text(encoding="utf-8")
    validate_script = (ROOT / "scripts" / "validate_contract.ps1").read_text(encoding="utf-8")

    assert "pip install -r requirements.txt" in workflow
    assert "genvm-lint check backend/pay-merit.py --json" in workflow
    assert "python -m pytest tests -v" in workflow
    assert "npm run build" in workflow
    assert "check \"backend/pay-merit.py\" --json" in validate_script
    assert "-m pytest \"tests\" -v" in validate_script
