"""
MeritLedger — compensation audit behaviour.

Covers the three verdict bands, the reliable partial-payment path (a short pool
parks the remainder as `owed` and pays it later), input guards, the recorded
rubric, and validator agreement on the band.
"""

import json
from pathlib import Path

LEDGER = str(Path(__file__).resolve().parents[1] / "backend" / "pay-merit.py")

WORK = ("Shipped the billing service end to end, merged nine reviewed pull "
        "requests, closed fourteen issues, and paired on the migration")


def audit(justified, delivery=90, corroboration=88, scope_fit=92, originality=86):
    return json.dumps({
        "criteria": {
            "delivery": delivery,
            "corroboration": corroboration,
            "scope_fit": scope_fit,
            "originality": originality,
        },
        "justified_units": justified,
        "rationale": "the merged PRs and approved reviews corroborate most of the claimed work",
    })


def fund(vm, ledger, amount, funder):
    vm.sender = funder
    vm.value = amount
    ledger.fund_pool()
    vm.value = 0


def test_a_well_evidenced_claim_is_paid_in_full(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)

    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)
    direct_vm.mock_llm(r"compensation auditor", audit(950))
    ledger.audit(0)
    ledger.rule(0)
    assert ledger.get_claim(0).verdict == "JUSTIFIED"

    ledger.disburse(0)
    claim = ledger.get_claim(0)
    assert ledger.get_stage(0) == "PAID"
    assert int(claim.paid) == 950
    assert ledger.get_pool() == "4050||0"


def test_a_thinly_evidenced_claim_is_trimmed(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)

    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)
    # Half of the ask is defensible -> REDUCE band, paid at the proven amount.
    direct_vm.mock_llm(r"compensation auditor", audit(500, corroboration=55))
    ledger.audit(0)
    ledger.rule(0)
    assert ledger.get_claim(0).verdict == "REDUCE"
    ledger.disburse(0)
    assert int(ledger.get_claim(0).paid) == 500


def test_an_unsupported_claim_is_rejected(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)

    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)
    direct_vm.mock_llm(r"compensation auditor", audit(100, corroboration=10, delivery=15))
    ledger.audit(0)
    ledger.rule(0)
    assert ledger.get_claim(0).verdict == "REJECT"

    with direct_vm.expect_revert("rejected"):
        ledger.disburse(0)


def test_a_short_pool_pays_what_it_can_then_settles_the_rest(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 600, direct_alice)  # not enough to cover 950

    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)
    direct_vm.mock_llm(r"compensation auditor", audit(950))
    ledger.audit(0)
    ledger.rule(0)
    ledger.disburse(0)

    assert ledger.get_stage(0) == "OWING"
    assert int(ledger.get_claim(0).paid) == 600
    assert int(ledger.get_claim(0).owed) == 350
    assert ledger.get_pool() == "0||350"  # outstanding tracked

    # Top the pool back up and clear the remainder.
    fund(direct_vm, ledger, 500, direct_alice)
    ledger.settle_owed(0)
    assert ledger.get_stage(0) == "PAID"
    assert int(ledger.get_claim(0).owed) == 0
    assert ledger.get_pool() == "150||0"


def test_overclaiming_is_clamped_to_the_request(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)

    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)
    # Model over-shoots the ask; the contract must cap it at the requested amount.
    direct_vm.mock_llm(r"compensation auditor", audit(2000))
    ledger.audit(0)
    assert int(ledger.get_claim(0).justified) == 1000
    ledger.rule(0)
    assert ledger.get_claim(0).verdict == "JUSTIFIED"


def test_the_desk_rejects_malformed_filings(direct_vm, deploy, direct_bob):
    ledger = deploy(LEDGER)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("scope"):
        ledger.file_claim("", 1000, WORK)
    with direct_vm.expect_revert("requested must be > 0"):
        ledger.file_claim("Platform engineering", 0, WORK)
    with direct_vm.expect_revert("too short"):
        ledger.file_claim("Platform engineering", 1000, "did stuff")


def test_the_jury_must_agree_on_the_band(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)
    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)

    direct_vm.mock_llm(r"compensation auditor", audit(950))
    ledger.audit(0)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"compensation auditor", audit(100))  # drops to REJECT band
    assert direct_vm.run_validator() is False


def test_the_rubric_is_kept_on_record(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 5000, direct_alice)
    direct_vm.sender = direct_bob
    ledger.file_claim("Platform engineering", 1000, WORK)

    direct_vm.mock_llm(r"compensation auditor", audit(950, delivery=77, originality=64))
    ledger.audit(0)
    assert ledger.get_rubric(0) == "delivery=77|corroboration=88|scope_fit=92|originality=64"
