# Worthwhile

Merit-based pay for contributors on [GenLayer](https://genlayer.com). A contributor files a claim with the scope and an evidence log; a panel of validators audits it against a four-part rubric under consensus, rules it JUSTIFIED, REDUCE, or REJECT, and disburses the justified amount from a shared pool.

## How it works

1. Fund the pool: anyone tops up the shared compensation pool with GEN.
2. File a claim: a contributor submits the scope of work, the requested amount, and an evidence log.
3. Audit: a validator jury scores the log on delivery, corroboration, scope-fit, and originality and reports the defensible amount; consensus needs both the verdict band and broad per-criterion agreement, not just a matching number.
4. Rule: the verdict band is frozen from the justified-to-requested ratio — JUSTIFIED at 90% or more, REDUCE at 20% or more, otherwise REJECT.
5. Disburse: the justified amount is released from the pool; if the pool is short it pays what it can and records the remainder as owed.
6. Settle: once the pool is refilled, an owing claim is paid down to zero.

## Architecture

```
backend/pay-merit.py   GenLayer Intelligent Contract (Python, runs on the GenVM)
frontend/              React + Vite + TypeScript dashboard (genlayer-js)
```

Disbursement is reliable rather than all-or-nothing: a short pool pays as far as it can and parks the remainder as `owed`, so nothing is silently dropped and the claim can be settled later once the pool is refilled.

## Live deployment

- **Network**: GenLayer Asimov Testnet (chain id 4221)
- **Contract**: `0x6478C33c09a8CE148D4048415836a0D626958eef`
- **App**: https://poporinna.github.io/pay-merit/

## Run locally

```bash
cd frontend
npm install
npm run dev
npm run build
```

The committed `.env` holds the public Asimov config; no secrets are required. Copy `.env.example` to `.env.local` only to override.

## Reproducible validation

This repository includes the validation files used for the contract workflow:

- `requirements.txt` installs `genvm-linter`, `genlayer-test`, and `pytest`.
- `tests/test_ledger.py` covers the MeritLedger lifecycle, verdict bands, partial payout, owed settlement, malformed filings, rubric storage, and validator disagreement.
- `tests/test_repository_validation.py` checks that the SDK pin, scripts, CI workflow, and tests are actually tracked in the repository.
- `.github/workflows/validate.yml` runs GenVM lint, direct contract tests, and the frontend production build.

From a fresh checkout:

```bash
python -m pip install -r requirements.txt
genvm-lint check backend/pay-merit.py --json
python -m pytest tests -v
cd frontend
npm ci
npm run build
```

On Windows, the same checks can be run with:

```powershell
.\scripts\validate_all.ps1
```

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `VITE_CONTRACT_ADDRESS` | yes | Deployed MeritLedger contract on Asimov |
| `VITE_CHAIN_ID` | yes | GenLayer chain id (4221) |
| `VITE_RPC_URL` | yes | Asimov JSON-RPC endpoint |

## Deploy the contract

```bash
npx genlayer deploy --contract backend/pay-merit.py
```

## Contract methods (`MeritLedger`)

| Method | Type | Description |
|--------|------|-------------|
| `fund_pool` | payable | Top up the shared compensation pool with attached GEN. |
| `file_claim` | write | File a claim with scope, requested amount, and work log; the caller becomes the claimant. |
| `audit` | write | Score the work log against the rubric via the validator jury and set the defensible amount. |
| `rule` | write | Freeze the verdict band from the audited justified-to-requested ratio. |
| `disburse` | write | Release the defensible GEN, paying partially and parking the remainder as owed if the pool is short. |
| `settle_owed` | write | Pay down the outstanding owed of an owing claim once the pool is refilled. |
| `get_claim` | view | Full claim record: claimant, scope, amounts, stage, verdict, rubric, and rationale. |
| `get_stage` | view | Current lifecycle stage name for a claim. |
| `get_rubric` | view | Pipe-delimited rubric scores (delivery, corroboration, scope_fit, originality). |
| `describe_criterion` | view | Human-readable label for a rubric criterion key. |
| `get_pool` | view | Pool balance and total outstanding owed, as `pool||outstanding`. |
| `get_stats` | view | Filed, ruled, and justified counts, as `filed||ruled||justified`. |

## License

MIT
