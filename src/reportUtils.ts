import type { MonthSnapshot } from "./dataUtils";
import { getLargestMovers, getMoMChange, getSparklineData } from "./dataUtils";

export interface PieSlice {
  name: string;
  value: number;
}

export interface ConcentrationReport {
  topAccounts: { account: string; amount: number; pct: number }[];
  topClasses: { name: string; amount: number; pct: number }[];
  warnings: string[];
}

export interface TargetRow {
  name: string;
  actual: number;
  actualPct: number;
  targetPct: number;
  variancePct: number;
}

export interface YoYCompare {
  currentLabel: string;
  priorLabel: string;
  currentTotal: number;
  priorTotal: number;
  change: number;
  changePct: number;
  byClass: { name: string; change: number; changePct: number }[];
}

export interface Scorecard {
  label: string;
  totalValue: number;
  momPct: number;
  yoyPct: number | null;
  topGainer: { account: string; change: number } | null;
  topLoser: { account: string; change: number } | null;
  assetClassCount: number;
}

export interface RealEstateRow {
  account: string;
  amount: number;
  pctOfRe: number;
  pctOfTotal: number;
  momChange: number;
  momChangePct: number;
  sparkline: number[];
}

export interface DebtRow {
  account: string;
  assetClass: string;
  amount: number;
  pctOfNetWorth: number;
}

function normClass(cls: string): string {
  return (cls || "").trim().replace(/\s+/g, " ");
}

function isInternational(account: string, assetClass: string): boolean {
  const a = account.toLowerCase();
  const c = normClass(assetClass).toLowerCase();
  if (c.includes("dubai")) return true;
  if (a.includes("adib") || a.includes("usa") || a.includes("chase") || a.includes("dubai")) return true;
  return false;
}

function liquidityBucket(assetClass: string): "Liquid" | "Semi-liquid" | "Illiquid" | "Other" {
  const c = normClass(assetClass).toLowerCase();
  if (["cash", "dubai cash", "money market"].some((x) => c === x || c.startsWith(x))) return "Liquid";
  if (["fixed income", "government bonds", "goverment bonds", "equity"].some((x) => c.includes(x))) return "Semi-liquid";
  if (["real estate", "debt", "automotive", "fetchsky"].some((x) => c.includes(x))) return "Illiquid";
  return "Other";
}

function incomeBucket(assetClass: string): string {
  const c = normClass(assetClass).toLowerCase();
  if (c.includes("money market") || c.includes("fixed income") || c.includes("bond")) return "Yield / Income";
  if (c.includes("real estate")) return "Capital (Real Estate)";
  if (c.includes("cash")) return "Idle Cash";
  if (c.includes("equity")) return "Growth (Equity)";
  if (c.includes("debt")) return "Receivables";
  if (c.includes("loan")) return "Liabilities";
  return "Other";
}

function isRealEstateClass(assetClass: string): boolean {
  return normClass(assetClass).toLowerCase().includes("real estate");
}

function isLiabilityRow(_account: string, assetClass: string, amount: number): boolean {
  const c = normClass(assetClass).toLowerCase();
  if (c === "loan" || c.includes("loan")) return true;
  if (amount < 0) return true;
  return false;
}

function aggregateByKey(rows: { key: string; value: number }[]): PieSlice[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.value === 0) continue;
    map.set(r.key, (map.get(r.key) ?? 0) + r.value);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** 1. Liquid vs illiquid */
export function getLiquidVsIlliquid(snapshot: MonthSnapshot): PieSlice[] {
  const rows: { key: string; value: number }[] = [];
  for (const r of snapshot.rows) {
    if (isLiabilityRow(r.account, r.assetClass, r.amountRs)) continue;
    rows.push({ key: liquidityBucket(r.assetClass), value: r.amountRs });
  }
  return aggregateByKey(rows);
}

/** 2. Real estate concentration */
export function getRealEstateBreakdown(snapshot: MonthSnapshot): PieSlice[] {
  const slices: PieSlice[] = [];
  for (const [cls, data] of Object.entries(snapshot.byAssetClass)) {
    if (!isRealEstateClass(cls)) continue;
    for (const a of data.accounts) {
      if (a.amount === 0) continue;
      slices.push({ name: a.account, value: a.amount });
    }
  }
  return slices.sort((a, b) => b.value - a.value);
}

/** 3. Geographic split */
export function getGeographicSplit(snapshot: MonthSnapshot): PieSlice[] {
  const rows: { key: string; value: number }[] = [];
  for (const r of snapshot.rows) {
    const key = isInternational(r.account, r.assetClass) ? "Dubai / International" : "Pakistan";
    rows.push({ key, value: r.amountRs });
  }
  return aggregateByKey(rows);
}

/** 4. Assets vs liabilities */
export function getAssetsVsLiabilities(snapshot: MonthSnapshot): PieSlice[] {
  let assets = 0;
  let liabilities = 0;
  for (const r of snapshot.rows) {
    if (isLiabilityRow(r.account, r.assetClass, r.amountRs)) liabilities += Math.abs(r.amountRs);
    else if (r.amountRs > 0) assets += r.amountRs;
    else liabilities += Math.abs(r.amountRs);
  }
  const out: PieSlice[] = [];
  if (assets > 0) out.push({ name: "Assets", value: assets });
  if (liabilities > 0) out.push({ name: "Liabilities", value: liabilities });
  return out;
}

/** 5. MoM change waterfall by asset class */
export function getMoMWaterfall(snapshots: MonthSnapshot[], monthKey: string): PieSlice[] {
  const mom = getMoMChange(snapshots, monthKey);
  return Object.entries(mom.byClass)
    .map(([name, d]) => ({ name, value: d.change }))
    .filter((d) => d.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** 6. Concentration report */
export function getConcentrationReport(snapshot: MonthSnapshot): ConcentrationReport {
  const total = snapshot.totalValue;
  const absTotal = Math.abs(total) || 1;
  const accounts: { account: string; amount: number; pct: number }[] = [];
  for (const [, data] of Object.entries(snapshot.byAssetClass)) {
    for (const a of data.accounts) {
      if (a.amount === 0) continue;
      accounts.push({ account: a.account, amount: a.amount, pct: (a.amount / absTotal) * 100 });
    }
  }
  accounts.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const topAccounts = accounts.slice(0, 5);
  const topClasses = Object.entries(snapshot.byAssetClass)
    .map(([name, d]) => ({ name, amount: d.total, pct: (d.total / absTotal) * 100 }))
    .filter((d) => d.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 3);
  const warnings: string[] = [];
  for (const a of topAccounts) {
    if (Math.abs(a.pct) > 25) warnings.push(`${a.account} is ${Math.abs(a.pct).toFixed(1)}% of net worth (>25%)`);
  }
  for (const c of topClasses) {
    if (Math.abs(c.pct) > 50) warnings.push(`${c.name} is ${Math.abs(c.pct).toFixed(1)}% of portfolio (>50%)`);
  }
  return { topAccounts, topClasses, warnings };
}

/** 7. Real estate trend */
export function getRealEstateTrend(snapshots: MonthSnapshot[]): { month: string; total: number; key: string }[] {
  return snapshots.map((s) => {
    let total = 0;
    for (const [cls, data] of Object.entries(s.byAssetClass)) {
      if (isRealEstateClass(cls)) total += data.total;
    }
    return { month: s.label, total, key: s.monthKey };
  });
}

/** 8. Fund / bank breakdown within Cash + Money Market */
export function getFundBankBreakdown(snapshot: MonthSnapshot): PieSlice[] {
  const slices: PieSlice[] = [];
  for (const [cls, data] of Object.entries(snapshot.byAssetClass)) {
    const c = normClass(cls).toLowerCase();
    if (!c.includes("cash") && !c.includes("money market")) continue;
    for (const a of data.accounts) {
      if (a.amount === 0) continue;
      slices.push({ name: a.account, value: a.amount });
    }
  }
  return slices.sort((a, b) => b.value - a.value);
}

export const DEFAULT_TARGET_ALLOCATION: Record<string, number> = {
  "Real Estate": 35,
  "Money Market": 25,
  Cash: 10,
  "Fixed Income": 10,
  Equity: 5,
  Debt: 5,
  Loan: 0,
  "Dubai Cash": 5,
  Automotive: 3,
  FetchSky: 2,
};

/** 9. Target vs actual */
export function getTargetVsActual(
  snapshot: MonthSnapshot,
  targets: Record<string, number> = DEFAULT_TARGET_ALLOCATION
): TargetRow[] {
  const total = Math.abs(snapshot.totalValue) || 1;
  const classes = new Set<string>();
  for (const cls of Object.keys(snapshot.byAssetClass)) classes.add(normClass(cls));
  for (const cls of Object.keys(targets)) classes.add(normClass(cls));
  return [...classes]
    .map((name) => {
      const actual =
        snapshot.byAssetClass[name]?.total ??
        Object.entries(snapshot.byAssetClass).find(([k]) => normClass(k) === name)?.[1]?.total ??
        0;
      const actualPct = (actual / total) * 100;
      const targetPct = targets[name] ?? 0;
      return { name, actual, actualPct, targetPct, variancePct: actualPct - targetPct };
    })
    .filter((r) => r.actual !== 0 || r.targetPct !== 0)
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
}

/** 10. Year-over-year compare */
export function getYoYCompare(snapshots: MonthSnapshot[], monthKey: string): YoYCompare | null {
  const curr = snapshots.find((s) => s.monthKey === monthKey);
  if (!curr) return null;
  const [y, m] = monthKey.split("-").map(Number);
  const priorKey = `${y - 1}-${String(m).padStart(2, "0")}`;
  const prior = snapshots.find((s) => s.monthKey === priorKey);
  if (!prior) return null;
  const change = curr.totalValue - prior.totalValue;
  const changePct = prior.totalValue !== 0 ? (change / prior.totalValue) * 100 : 0;
  const byClass: YoYCompare["byClass"] = [];
  const classes = new Set([...Object.keys(curr.byAssetClass), ...Object.keys(prior.byAssetClass)]);
  for (const name of classes) {
    const c = curr.byAssetClass[name]?.total ?? 0;
    const p = prior.byAssetClass[name]?.total ?? 0;
    const d = c - p;
    byClass.push({ name, change: d, changePct: p !== 0 ? (d / p) * 100 : 0 });
  }
  byClass.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return {
    currentLabel: curr.label,
    priorLabel: prior.label,
    currentTotal: curr.totalValue,
    priorTotal: prior.totalValue,
    change,
    changePct,
    byClass: byClass.slice(0, 8),
  };
}

/** 11. Summary scorecard */
export function getSummaryScorecard(snapshots: MonthSnapshot[], monthKey: string): Scorecard | null {
  const curr = snapshots.find((s) => s.monthKey === monthKey);
  if (!curr) return null;
  const mom = getMoMChange(snapshots, monthKey);
  const yoy = getYoYCompare(snapshots, monthKey);
  const movers = getLargestMovers(snapshots, monthKey, 20);
  const gainer = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change)[0];
  const loser = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change)[0];
  return {
    label: curr.label,
    totalValue: curr.totalValue,
    momPct: mom.totalChangePct,
    yoyPct: yoy?.changePct ?? null,
    topGainer: gainer ? { account: gainer.account, change: gainer.change } : null,
    topLoser: loser ? { account: loser.account, change: loser.change } : null,
    assetClassCount: Object.keys(curr.byAssetClass).filter((k) => curr.byAssetClass[k].total !== 0).length,
  };
}

/** 12. Real estate ledger */
export function getRealEstateLedger(snapshots: MonthSnapshot[], monthKey: string): RealEstateRow[] {
  const curr = snapshots.find((s) => s.monthKey === monthKey);
  if (!curr) return [];
  let reTotal = 0;
  const rows: RealEstateRow[] = [];
  for (const [cls, data] of Object.entries(curr.byAssetClass)) {
    if (!isRealEstateClass(cls)) continue;
    reTotal += data.total;
    for (const a of data.accounts) {
      if (a.amount === 0) continue;
      const idx = snapshots.findIndex((s) => s.monthKey === monthKey);
      const prevCls = idx > 0 ? snapshots[idx - 1]?.byAssetClass[cls] : undefined;
      const prevAmt = prevCls?.accounts.find((x) => x.account === a.account)?.amount ?? 0;
      const momChange = a.amount - prevAmt;
      rows.push({
        account: a.account,
        amount: a.amount,
        pctOfRe: reTotal !== 0 ? (a.amount / reTotal) * 100 : 0,
        pctOfTotal: curr.totalValue !== 0 ? (a.amount / curr.totalValue) * 100 : 0,
        momChange,
        momChangePct: prevAmt !== 0 ? (momChange / prevAmt) * 100 : 0,
        sparkline: getSparklineData(snapshots, a.account, true),
      });
    }
  }
  for (const row of rows) {
    const reSum = rows.reduce((s, r) => s + r.amount, 0);
    row.pctOfRe = reSum !== 0 ? (row.amount / reSum) * 100 : 0;
  }
  return rows.sort((a, b) => b.amount - a.amount);
}

/** 13. Debt & loan report */
export function getDebtLoanReport(snapshot: MonthSnapshot): { rows: DebtRow[]; totalDebt: number; pctOfNetWorth: number } {
  const rows: DebtRow[] = [];
  let totalDebt = 0;
  for (const [cls, data] of Object.entries(snapshot.byAssetClass)) {
    for (const a of data.accounts) {
      if (!isLiabilityRow(a.account, cls, a.amount) && a.amount >= 0) continue;
      const amt = a.amount < 0 ? a.amount : -Math.abs(a.amount);
      totalDebt += Math.abs(amt);
      rows.push({
        account: a.account,
        assetClass: cls,
        amount: amt,
        pctOfNetWorth: snapshot.totalValue !== 0 ? (Math.abs(amt) / Math.abs(snapshot.totalValue)) * 100 : 0,
      });
    }
  }
  return { rows: rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), totalDebt, pctOfNetWorth: snapshot.totalValue !== 0 ? (totalDebt / Math.abs(snapshot.totalValue)) * 100 : 0 };
}

/** 14. Income-generating vs capital */
export function getIncomeVsCapital(snapshot: MonthSnapshot): PieSlice[] {
  const rows: { key: string; value: number }[] = [];
  for (const r of snapshot.rows) {
    if (isLiabilityRow(r.account, r.assetClass, r.amountRs)) continue;
    rows.push({ key: incomeBucket(r.assetClass), value: Math.max(0, r.amountRs) });
  }
  return aggregateByKey(rows);
}

/** Heatmap helper for account × month */
export function getAccountHeatmapData(
  snapshots: MonthSnapshot[],
  limit = 12
): { account: string; values: { month: string; value: number }[] }[] {
  const accountTotals = new Map<string, number>();
  for (const s of snapshots) {
    for (const r of s.rows) accountTotals.set(r.account, (accountTotals.get(r.account) ?? 0) + Math.abs(r.amountRs));
  }
  const topAccounts = [...accountTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([a]) => a);
  return topAccounts.map((account) => ({
    account,
    values: snapshots.map((s) => {
      let val = 0;
      for (const r of s.rows) if (r.account === account) val = r.amountRs;
      return { month: s.label, value: val };
    }),
  }));
}
