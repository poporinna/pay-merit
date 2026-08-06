import { createClient, createAccount } from "genlayer-js";
import { testnetAsimov } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, GENLAYER_NETWORK } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

export type Verdict = "JUSTIFIED" | "REDUCE" | "REJECT" | "";

export interface Rubric {
  delivery: number;
  corroboration: number;
  scope_fit: number;
  originality: number;
}

export interface ClaimView {
  claimant: string;
  scope: string;
  workLog: string;
  requested: string;
  justified: string;
  paid: string;
  owed: string;
  stage: number;
  verdict: Verdict;
  rubric: Rubric;
  rationale: string;
}
export interface ClaimRow extends ClaimView { id: number; }

export interface Stats { filed: number; ruled: number; justified: number; }
export interface Pool { pool: string; outstanding: string; }

function readClient() { return createClient({ chain: testnetAsimov, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: testnetAsimov, account }); }
async function ensureConnected(client: any) { try { if (typeof client.connect === "function") await client.connect(GENLAYER_NETWORK); } catch { /* noop */ } }
async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS); });
  try { await Promise.race([client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
function pick(obj: any, key: string, idx: number): any { if (obj == null) return undefined; if (Array.isArray(obj)) return obj[idx]; if (typeof obj === "object" && key in obj) return obj[key]; return undefined; }
async function write(account: Hex, functionName: string, args: any[], value = 0n): Promise<void> {
  const wc = writeClient(account); await ensureConnected(wc);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName, args, value })) as Hex;
  await waitAccepted(wc, h);
}

// ---- Lifecycle: fund_pool, file_claim -> audit -> rule -> disburse (-> settle_owed) ----

export async function fundPool(account: Hex, wei: bigint): Promise<void> { await write(account, "fund_pool", [], wei); }
export async function fileClaim(account: Hex, scope: string, requested: bigint, workLog: string): Promise<number> {
  await write(account, "file_claim", [scope.trim(), requested, workLog.trim()]);
  const s = await getStats();
  return s.filed - 1;
}
export async function audit(account: Hex, id: number): Promise<void> { await write(account, "audit", [id]); }
export async function rule(account: Hex, id: number): Promise<void> { await write(account, "rule", [id]); }
export async function disburse(account: Hex, id: number): Promise<void> { await write(account, "disburse", [id]); }
export async function settleOwed(account: Hex, id: number): Promise<void> { await write(account, "settle_owed", [id]); }

// ---- Views ----

function decodeRubric(r: any): Rubric {
  return {
    delivery: Number(pick(r, "delivery", 0) ?? 0),
    corroboration: Number(pick(r, "corroboration", 1) ?? 0),
    scope_fit: Number(pick(r, "scope_fit", 2) ?? 0),
    originality: Number(pick(r, "originality", 3) ?? 0),
  };
}

export async function getClaim(id: number): Promise<ClaimView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_claim", args: [id] });
  return {
    claimant: String(pick(r, "claimant", 0) ?? ""),
    scope: String(pick(r, "scope", 1) ?? ""),
    workLog: String(pick(r, "work_log", 2) ?? ""),
    requested: String(pick(r, "requested", 3) ?? "0"),
    justified: String(pick(r, "justified", 4) ?? "0"),
    paid: String(pick(r, "paid", 5) ?? "0"),
    owed: String(pick(r, "owed", 6) ?? "0"),
    stage: Number(pick(r, "stage", 7) ?? 0),
    verdict: String(pick(r, "verdict", 8) ?? "") as Verdict,
    rubric: decodeRubric(pick(r, "rubric", 9)),
    rationale: String(pick(r, "rationale", 10) ?? ""),
  };
}

export async function getStage(id: number): Promise<string> {
  return String(await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_stage", args: [id] }) ?? "");
}
// "delivery=..|corroboration=..|scope_fit=..|originality=.."
export async function getRubric(id: number): Promise<Rubric> {
  const raw = String(await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_rubric", args: [id] }) ?? "");
  const out: any = { delivery: 0, corroboration: 0, scope_fit: 0, originality: 0 };
  raw.split("|").forEach((kv) => { const [k, v] = kv.split("="); if (k in out) out[k] = Number(v) || 0; });
  return out as Rubric;
}
export async function describeCriterion(key: string): Promise<string> {
  return String(await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "describe_criterion", args: [key] }) ?? "");
}

// get_pool -> "pool||outstanding"
export async function getPool(): Promise<Pool> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_pool", args: [] });
  const p = String(r).split("||");
  return { pool: p[0] || "0", outstanding: p[1] || "0" };
}
// get_stats -> "filed||ruled||justified"
export async function getStats(): Promise<Stats> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_stats", args: [] });
  const p = String(r).split("||").map((x) => Number(x) || 0);
  return { filed: p[0] || 0, ruled: p[1] || 0, justified: p[2] || 0 };
}

export async function listAll(maxRows = 80): Promise<ClaimRow[]> {
  const { filed } = await getStats();
  if (filed === 0) return [];
  const ids: number[] = [];
  for (let i = filed - 1; i >= 0 && i >= filed - maxRows; i--) ids.push(i);
  const rows = await Promise.all(ids.map(async (id) => { try { const c = await getClaim(id); return { id, ...c }; } catch { return null; } }));
  return rows.filter((r): r is ClaimRow => r !== null);
}
