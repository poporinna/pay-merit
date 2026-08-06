import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import anime from "animejs";
import { parseEther, formatEther } from "viem";
import {
  fundPool, fileClaim, audit, rule, disburse, settleOwed,
  getClaim, getStats, getPool, listAll,
  ClaimView, ClaimRow, Stats, Pool,
} from "./contractService";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const STAGE_LABEL = ["filed", "audited", "ruled", "paid", "owing"];
const toWei = (g: string): bigint => { try { return parseEther((g || "0").trim()); } catch { return 0n; } };
const gen = (wei: string): string => { try { return formatEther(BigInt(wei || "0")); } catch { return wei || "0"; } };
const reduced = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function WalletControl() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!connected) return <button className="wbtn" onClick={openConnectModal} type="button">Connect Wallet</button>;
        if (chain?.unsupported) return <button className="wbtn wbtn-warn" onClick={openChainModal} type="button">Wrong network</button>;
        return <button className="wchip" onClick={openAccountModal} type="button"><span className="wdot" />{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
  );
}

const TIER: Record<string, string> = { JUSTIFIED: "ratified", REDUCE: "suspect", REJECT: "rejected" };
function rank(v: string): string {
  if (v === "JUSTIFIED") return "Payout justified";
  if (v === "REDUCE") return "Reduced payout";
  if (v === "REJECT") return "Claim rejected";
  return "-";
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;
  const [scope, setScope] = useState("");
  const [requested, setRequested] = useState("5");
  const [workLog, setWorkLog] = useState("");
  const [funding, setFunding] = useState("20");

  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [stats, setStats] = useState<Stats>({ filed: 0, ruled: 0, justified: 0 });
  const [pool, setPool] = useState<Pool>({ pool: "0", outstanding: "0" });
  const [selId, setSelId] = useState<number | null>(null);
  const [sel, setSel] = useState<ClaimView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);
  const ticker = useRef({ v: 0 });
  const rowRef = useRef<HTMLDivElement>(null);

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [s, p, l] = await Promise.all([getStats(), getPool(), listAll(80)]);
      setStats(s); setPool(p); setRows(l);
      if (selId != null) { try { setSel(await getClaim(selId)); } catch { /* keep */ } }
    } catch { /* offline */ }
  }
  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => {
    if (!busy) return;
    if (reduced()) { setClock(424242); return; }
    ticker.current.v = 0;
    const count = anime({ targets: ticker.current, v: 9_999_990, round: 1, easing: "linear", duration: 6000, loop: true, update: () => setClock(ticker.current.v) });
    return () => count.pause();
  }, [busy]);

  useEffect(() => {
    if (busy || !sel || !rowRef.current || reduced()) return;
    anime({ targets: rowRef.current, translateX: [-40, 0], opacity: [0, 1], easing: "easeOutExpo", duration: 600 });
    anime({ targets: rowRef.current.querySelectorAll(".cell"), opacity: [0, 1], translateY: [10, 0], delay: anime.stagger(80, { start: 150 }), easing: "easeOutCubic", duration: 400 });
  }, [sel, busy]);

  async function select(id: number) { setSelId(id); try { setSel(await getClaim(id)); } catch { setSel(null); } }
  async function act<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError("");
    try { return await fn(); } catch (e: any) { setError((e?.message || String(e)).slice(0, 170)); return undefined; }
    finally { setBusy(null); refreshAll(); }
  }
  async function onFile() {
    if (!acct) return;
    if (scope.trim().length < 3) return setError("Scope is required.");
    if (toWei(requested) <= 0n) return setError("Requested payout must be > 0 GEN.");
    if (workLog.trim().length < 30) return setError("Work log ≥ 30 chars.");
    const id = await act("Filing the claim", () => fileClaim(acct, scope, toWei(requested), workLog));
    if (id != null) { setScope(""); setWorkLog(""); setRequested("5"); setSelId(id); }
  }
  async function onFund() { if (!acct) return; if (toWei(funding) <= 0n) return setError("Amount must be > 0 GEN."); await act("Funding the pool", () => fundPool(acct, toWei(funding))); }
  async function onAudit() { if (!acct || selId == null) return; await act("Auditing the work log", () => audit(acct, selId)); }
  async function onRule() { if (!acct || selId == null) return; await act("Ruling the claim", () => rule(acct, selId)); }
  async function onDisburse() { if (!acct || selId == null) return; await act("Disbursing the payout", () => disburse(acct, selId)); }
  async function onSettle() { if (!acct || selId == null) return; await act("Settling the owed remainder", () => settleOwed(acct, selId)); }

  const v = sel?.verdict || "";
  const tier = v ? TIER[v] || "" : "";
  const payAmount = sel ? (Number(sel.paid) > 0 ? sel.paid : Number(sel.justified) > 0 ? sel.justified : sel.requested) : "0";
  const displayPay = busy ? (clock / 100).toFixed(2) : sel ? gen(payAmount) : "0.00";

  return (
    <div className="cab">
      <div className="scanlines" aria-hidden />
      <header className="bar">
        <span className="logo"><span className="logo-blip" />MERIT<b>LEDGER</b></span>
        <WalletControl />
      </header>

      <section className="marquee">
        <p className="insert">File a claim · earn your payout</p>
        <h1>Every payout gets <span className="glo">verified</span> before it clears.</h1>
        <p className="blurb">
          File a merit claim with the scope of work and an evidence log. A decentralised panel of
          GenLayer auditors scores it on delivery, corroboration, scope-fit, and originality, rules it
          JUSTIFIED, REDUCE, or REJECT, then disburses the justified amount from the pool.
        </p>
      </section>

      <main className="floor">
        <div className="cartridge">
          <span className="cart-tab">FILE A CLAIM</span>

          <div className="block">
            <label className="blabel" htmlFor="scope">Scope of work</label>
            <span className="bnote">What was delivered, in one line.</span>
            <input id="scope" className="mono" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Audit + fix of the staking module" />
          </div>

          <div className="block">
            <label className="blabel" htmlFor="req">Requested payout (GEN)</label>
            <span className="bnote">The amount the claimant is asking for.</span>
            <input id="req" className="mono" value={requested} onChange={(e) => setRequested(e.target.value)} placeholder="5" />
          </div>

          <div className="block">
            <label className="blabel" htmlFor="log">Work log / evidence</label>
            <span className="bnote">Commits, links, deliverables the auditors weigh (≥ 30 chars).</span>
            <textarea id="log" className="mono" value={workLog} onChange={(e) => setWorkLog(e.target.value)} placeholder="PR #214, deploy tx, before/after metrics…" />
          </div>

          <button className="play" disabled={!isConnected || !!busy} onClick={onFile} type="button">
            {busy === "Filing the claim" ? "Filing…" : "Submit for audit"}
          </button>
          {!isConnected && <span className="coin">Connect a wallet on GenLayer Asimov to file.</span>}
          {error && <p className="ohno">{error}</p>}

          <div className="block" style={{ marginTop: 22 }}>
            <span className="blabel">Fund the merit pool (GEN)</span>
            <span className="bnote">Payouts clear from this pool.</span>
            <input className="mono" value={funding} onChange={(e) => setFunding(e.target.value)} placeholder="20" />
            <button className="play alt" style={{ marginTop: 10 }} disabled={!isConnected || !!busy} onClick={onFund} type="button">Fund pool</button>
          </div>

          <div className="stat-line">
            <span>filed <b>{stats.filed}</b></span>
            <span>ruled <b>{stats.ruled}</b></span>
            <span>justified <b>{stats.justified}</b></span>
            <span>pool <b>{gen(pool.pool)}</b></span>
            <span>outstanding <b>{gen(pool.outstanding)}</b></span>
          </div>

          {rows.length > 0 && (
            <div className="block" style={{ marginTop: 22 }}>
              <span className="blabel">Filed claims</span>
              <div className="clist">
                {rows.map((c) => (
                  <button key={c.id} type="button" className={"clip " + (selId === c.id ? "on" : "")} onClick={() => select(c.id)}>
                    <span className="cp">{String(c.id).padStart(2, "0")}</span>
                    <span className="cw"><b>{c.scope}</b><i>{STAGE_LABEL[c.stage]} · req {gen(c.requested)} GEN</i></span>
                    <span className={"ct t-" + (c.verdict || "")}>{c.verdict || "…"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="board">
          <div className="board-head">
            <span>MERIT BOARD</span>
            <span className="board-cat">{sel ? STAGE_LABEL[sel.stage] : "ready"}</span>
          </div>

          <div className="timer-bay">
            <span className="timer-cap">{busy ? "AUDITING" : sel && Number(sel.paid) > 0 ? "PAID (GEN)" : sel ? "JUSTIFIED PAYOUT (GEN)" : "READY"}</span>
            <div className={"timer small " + (busy ? "running" : "")}>{displayPay}</div>
          </div>

          {sel && selId != null ? (
            <div className={"lrow r-" + tier} ref={rowRef}>
              <span className="cell pos">{String(selId).padStart(2, "0")}</span>
              <span className="cell who">{sel.scope}</span>
              <span className="cell tag">{v || "PENDING"}</span>
            </div>
          ) : (
            <div className="lrow lrow-empty">
              <span className="cell pos">-</span>
              <span className="cell who">{busy ? "auditors weighing the evidence…" : "no claim selected"}</span>
              <span className="cell tag">…</span>
            </div>
          )}

          {sel && selId != null && (
            <div className={"ruling-card r-" + tier}>
              <span className="ruling-cap">Auditors' ruling</span>
              <h2>{v ? rank(v) : "Under audit"}</h2>
              {(sel.rubric.delivery + sel.rubric.corroboration + sel.rubric.scope_fit + sel.rubric.originality) > 0 && (
                <div className="rubric">
                  <span className="rchip">delivery <b>{sel.rubric.delivery}</b></span>
                  <span className="rchip">corroboration <b>{sel.rubric.corroboration}</b></span>
                  <span className="rchip">scope-fit <b>{sel.rubric.scope_fit}</b></span>
                  <span className="rchip">originality <b>{sel.rubric.originality}</b></span>
                </div>
              )}
              <div className="money">
                <span>requested <b>{gen(sel.requested)}</b></span>
                <span>justified <b>{gen(sel.justified)}</b></span>
                <span>paid <b>{gen(sel.paid)}</b></span>
                {Number(sel.owed) > 0 && <span>owed <b>{gen(sel.owed)}</b></span>}
              </div>
              <p>{sel.rationale || "No ruling notes yet — advance the claim through the stages."}</p>
              {sel.stage === 0 && <button className="play alt" disabled={!!busy} onClick={onAudit} type="button">Audit the log</button>}
              {sel.stage === 1 && <button className="play alt" disabled={!!busy} onClick={onRule} type="button">Rule the claim</button>}
              {sel.stage === 2 && <button className="play" disabled={!!busy} onClick={onDisburse} type="button">Disburse payout</button>}
              {sel.stage === 4 && <button className="play" disabled={!!busy} onClick={onSettle} type="button">Settle owed remainder</button>}
              <span className={"crown " + (Number(sel.paid) > 0 ? "crown-on" : "crown-off")}>{Number(sel.paid) > 0 ? `Paid ${gen(sel.paid)} GEN` : "Not yet paid"}</span>
              <span className="settled">Ruling settled on GenLayer Asimov 4221</span>
            </div>
          )}
        </div>
      </main>

      <footer className="credits">
        <span className="logo small"><span className="logo-blip" />MERIT<b>LEDGER</b></span>
        <span className="machine">cab {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)} · judged on Asimov 4221</span>
      </footer>
    </div>
  );
}
