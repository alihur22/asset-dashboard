/**
 * Parse asset dashboard CSV and extract start-of-month snapshots.
 * Supports:
 * - Date column: MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD
 * - Or separate Month and Year columns (Month: 1-12 or Jan/Feb/..., Year: 2024)
 */

export interface AssetRow {
  date: string; // YYYY-MM-DD
  account: string;
  amountRs: number;
  amountMillions: number;
  assetClass: string;
}

export interface MonthSnapshot {
  monthKey: string; // "2024-09", "2024-10", ...
  label: string; // "Sep 2024", "Oct 2024"
  rows: AssetRow[];
  byAssetClass: Record<string, { total: number; accounts: { account: string; amount: number }[] }>;
  totalValue: number;
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Account-specific asset class corrections (lowercase account name → class) */
const ACCOUNT_ASSET_CLASS_OVERRIDES: Record<string, string> = {
  "chase securities": "Equity",
};

function resolveAssetClass(account: string, assetClass: string): string {
  const override = ACCOUNT_ASSET_CLASS_OVERRIDES[account.trim().toLowerCase()];
  if (override) return override;
  return (assetClass || "").trim() || "Other";
}

function parseMonth(value: string): number | null {
  const v = (value || "").trim().toLowerCase();
  const n = parseInt(v, 10);
  if (n >= 1 && n <= 12) return n;
  const idx = MONTH_NAMES.indexOf(v.slice(0, 3));
  if (idx >= 0) return idx + 1;
  return null;
}

export type DateFormat = "mmddyyyy" | "ddmmyyyy";

function parseDateFromString(val: string, dateFormat: DateFormat = "mmddyyyy"): { year: number; month: number; day: number } | null {
  const s = (val || "").trim();
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }
  // MM/DD/YYYY or DD/MM/YYYY
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const a = parseInt(slash[1], 10);
    const b = parseInt(slash[2], 10);
    const year = parseInt(slash[3], 10);
    // If first number > 12, it's DD/MM/YYYY (day first)
    if (a > 12 && b <= 12) return { year, month: b, day: a };
    // If second number > 12, it's MM/DD/YYYY (month first)
    if (b > 12 && a <= 12) return { year, month: a, day: b };
    // Both <= 12: use dateFormat preference
    if (a <= 31 && b <= 12) {
      if (dateFormat === "ddmmyyyy") return { year, month: b, day: a }; // DD/MM
      return { year, month: a, day: b }; // MM/DD
    }
  }
  // MonthName//Year or MonthName/Year (e.g. Aug//2024, Sep/2024)
  const monthYear = /^([a-zA-Z]{3,})\/+\s*(\d{4})$/.exec(s);
  if (monthYear) {
    const month = parseMonth(monthYear[1]);
    const year = parseInt(monthYear[2], 10);
    if (month && year >= 1900 && year <= 2100) return { year, month, day: 1 };
  }
  return null;
}

function toLabel(year: number, month: number): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[month - 1]} ${year}`;
}

export function parseCsv(content: string, dateFormat: DateFormat = "mmddyyyy"): AssetRow[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h === "date");
  const monthIdx = header.findIndex((h) => h === "month");
  const yearIdx = header.findIndex((h) => h === "year");
  const accountIdx = header.findIndex((h) => h === "account");
  const amountIdx = header.findIndex((h) => h.includes("amount") && !h.includes("million"));
  const millionsIdx = header.findIndex((h) => h.includes("million"));
  const assetIdx = header.findIndex((h) => h.includes("asset"));
  const hasDate = dateIdx >= 0;
  const hasMonthYear = monthIdx >= 0 && yearIdx >= 0;
  if ((!hasDate && !hasMonthYear) || accountIdx < 0 || amountIdx < 0) return [];

  const rows: AssetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    let parsed: { year: number; month: number; day: number } | null = null;
    if (hasDate) {
      parsed = parseDateFromString(parts[dateIdx] || "", dateFormat);
    }
    if (!parsed && hasMonthYear) {
      const month = parseMonth(parts[monthIdx] || "");
      const year = parseInt((parts[yearIdx] || "").replace(/,/g, "").trim(), 10);
      if (month && !isNaN(year) && year >= 1900 && year <= 2100) {
        parsed = { year, month, day: 1 };
      }
    }
    if (!parsed) continue;
    const amountStr = (parts[amountIdx] || "0").replace(/,/g, "").trim();
    const amountRs = parseFloat(amountStr) || 0;
    const amountMillions = millionsIdx >= 0 ? parseFloat((parts[millionsIdx] || "0").replace(/,/g, "")) || 0 : amountRs / 1e6;
    const assetClass = resolveAssetClass(parts[accountIdx] || "", (parts[assetIdx] ?? "").toString());
    rows.push({
      date: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`,
      account: (parts[accountIdx] || "").trim(),
      amountRs,
      amountMillions,
      assetClass,
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if ((ch === "," && !inQuotes) || ch === "\t") {
      result.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

/** Get start-of-month snapshots: for each month, use the earliest date's data. */
export function getStartOfMonthSnapshots(rows: AssetRow[]): MonthSnapshot[] {
  const byMonth = new Map<string, AssetRow[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7); // YYYY-MM
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(r);
  }

  const snapshots: MonthSnapshot[] = [];
  for (const [monthKey, monthRows] of byMonth.entries()) {
    const byDate = new Map<string, AssetRow[]>();
    for (const r of monthRows) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date)!.push(r);
    }
    const earliestDate = [...byDate.keys()].sort()[0];
    const dayRows = byDate.get(earliestDate)!;

    const byAssetClass: Record<string, { total: number; accounts: { account: string; amount: number }[] }> = {};
    let totalValue = 0;
    for (const r of dayRows) {
      const cls = (r.assetClass || "").trim() || "Other";
      if (!byAssetClass[cls]) byAssetClass[cls] = { total: 0, accounts: [] };
      byAssetClass[cls].total += r.amountRs;
      byAssetClass[cls].accounts.push({ account: r.account, amount: r.amountRs });
      totalValue += r.amountRs;
    }

    const [y, m] = monthKey.split("-").map(Number);
    snapshots.push({
      monthKey,
      label: toLabel(y, m),
      rows: dayRows,
      byAssetClass,
      totalValue,
    });
  }
  snapshots.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return snapshots;
}

/** Apply value edits to snapshots. edits key = "monthKey|account", value = new amount (Rs). */
export function applyEditsToSnapshots(
  snapshots: MonthSnapshot[],
  edits: Record<string, number>
): MonthSnapshot[] {
  if (Object.keys(edits).length === 0) return snapshots;
  return snapshots.map((s) => {
    const newRows = s.rows.map((r) => {
      const key = `${s.monthKey}|${r.account}`;
      const amount = edits[key] ?? r.amountRs;
      return { ...r, amountRs: amount };
    });
    const byAssetClass: Record<string, { total: number; accounts: { account: string; amount: number }[] }> = {};
    let totalValue = 0;
    for (const r of newRows) {
      const cls = (r.assetClass || "").trim() || "Other";
      if (!byAssetClass[cls]) byAssetClass[cls] = { total: 0, accounts: [] };
      byAssetClass[cls].total += r.amountRs;
      byAssetClass[cls].accounts.push({ account: r.account, amount: r.amountRs });
      totalValue += r.amountRs;
    }
    return { ...s, rows: newRows, byAssetClass, totalValue };
  });
}

/** Convert YYYY-MM-DD to CSV date string (MM/DD/YYYY or DD/MM/YYYY) */
export function toCsvDate(isoDate: string, dateFormat: DateFormat = "mmddyyyy"): string {
  const [y, m, d] = isoDate.split("-");
  if (dateFormat === "ddmmyyyy") return `${d}/${m}/${y}`;
  return `${m}/${d}/${y}`;
}

/** Build CSV template from a snapshot for the next month. */
export function buildTemplateFromSnapshot(
  snapshot: MonthSnapshot,
  nextMonthKey: string,
  dateFormat: DateFormat = "mmddyyyy"
): string {
  const [y, m] = nextMonthKey.split("-").map(Number);
  const dateStr = dateFormat === "ddmmyyyy" ? `01/${String(m).padStart(2, "0")}/${y}` : `${String(m).padStart(2, "0")}/01/${y}`;
  const rows = ["Date,Account,Amount (Rs),Amount (Millions),Asset Class"];
  for (const r of snapshot.rows) {
    rows.push(`${dateStr},${r.account},${r.amountRs},${(r.amountRs / 1e6).toFixed(2)},${r.assetClass}`);
  }
  return rows.join("\n");
}

/** Get next month key (e.g. "2026-03" -> "2026-04") */
export function getNextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Build full CSV from snapshots (for export with edits). */
export function buildCsvFromSnapshots(snapshots: MonthSnapshot[], dateFormat: DateFormat = "mmddyyyy"): string {
  const rows = ["Date,Account,Amount (Rs),Amount (Millions),Asset Class"];
  for (const s of snapshots) {
    for (const r of s.rows) {
      const d = toCsvDate(r.date, dateFormat);
      rows.push(`${d},${r.account},${r.amountRs},${(r.amountRs / 1e6).toFixed(2)},${r.assetClass}`);
    }
  }
  return rows.join("\n");
}

/** Merge two CSV contents: keep existing rows, replace rows for months that appear in newContent. */
export function mergeCsvContent(existing: string, newContent: string, dateFormat: DateFormat = "mmddyyyy"): string {
  const existingRows = parseCsv(existing, dateFormat);
  const newRows = parseCsv(newContent, dateFormat);
  const newMonths = new Set(newRows.map((r) => r.date.slice(0, 7)));
  const kept = existingRows.filter((r) => !newMonths.has(r.date.slice(0, 7)));
  const merged = [...kept, ...newRows].sort((a, b) => a.date.localeCompare(b.date));
  const header = "Date,Account,Amount (Rs),Amount (Millions),Asset Class";
  const lines = [
    header,
    ...merged.map((r) => {
      const d = toCsvDate(r.date, dateFormat);
      return `${d},${r.account},${r.amountRs},${(r.amountRs / 1e6).toFixed(2)},${r.assetClass}`;
    }),
  ];
  return lines.join("\n");
}

export type SortBy = "value" | "name" | "change";

export function getMoMChange(
  snapshots: MonthSnapshot[],
  monthKey: string
): { totalChange: number; totalChangePct: number; byClass: Record<string, { change: number; changePct: number }> } {
  const idx = snapshots.findIndex((s) => s.monthKey === monthKey);
  const prev = idx > 0 ? snapshots[idx - 1] : null;
  const curr = snapshots.find((s) => s.monthKey === monthKey);
  if (!curr) return { totalChange: 0, totalChangePct: 0, byClass: {} };
  const totalChange = prev ? curr.totalValue - prev.totalValue : 0;
  const totalChangePct = prev && prev.totalValue !== 0 ? (totalChange / prev.totalValue) * 100 : 0;
  const byClass: Record<string, { change: number; changePct: number }> = {};
  for (const [cls, data] of Object.entries(curr.byAssetClass)) {
    const prevVal = prev?.byAssetClass[cls]?.total ?? 0;
    const change = data.total - prevVal;
    const changePct = prevVal !== 0 ? (change / prevVal) * 100 : 0;
    byClass[cls] = { change, changePct };
  }
  return { totalChange, totalChangePct, byClass };
}

export function getLargestMovers(
  snapshots: MonthSnapshot[],
  monthKey: string,
  limit = 5
): { account: string; assetClass: string; change: number; changePct: number }[] {
  const idx = snapshots.findIndex((s) => s.monthKey === monthKey);
  const prev = idx > 0 ? snapshots[idx - 1] : null;
  const curr = snapshots.find((s) => s.monthKey === monthKey);
  if (!curr || !prev) return [];
  const prevByAccount = new Map<string, number>();
  for (const [, data] of Object.entries(prev.byAssetClass)) {
    for (const a of data.accounts) prevByAccount.set(a.account, (prevByAccount.get(a.account) ?? 0) + a.amount);
  }
  const movers: { account: string; assetClass: string; change: number; changePct: number }[] = [];
  for (const [cls, data] of Object.entries(curr.byAssetClass)) {
    for (const a of data.accounts) {
      const prevVal = prevByAccount.get(a.account) ?? 0;
      const change = a.amount - prevVal;
      if (Math.abs(change) > 0) {
        const changePct = prevVal !== 0 ? (change / prevVal) * 100 : (change > 0 ? 100 : -100);
        movers.push({ account: a.account, assetClass: cls, change, changePct });
      }
    }
  }
  return movers
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);
}

export function getSparklineData(
  snapshots: MonthSnapshot[],
  accountOrClass: string,
  byAccount: boolean
): number[] {
  return snapshots.map((s) => {
    if (byAccount) {
      for (const [, data] of Object.entries(s.byAssetClass)) {
        const a = data.accounts.find((x) => x.account === accountOrClass);
        if (a) return a.amount;
      }
      return 0;
    } else {
      return s.byAssetClass[accountOrClass]?.total ?? 0;
    }
  });
}

export function getValidationWarnings(
  snapshots: MonthSnapshot[],
  thresholdPct = 50
): { monthKey: string; account: string; changePct: number; message: string }[] {
  const warnings: { monthKey: string; account: string; changePct: number; message: string }[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    for (const [cls, data] of Object.entries(curr.byAssetClass)) {
      for (const a of data.accounts) {
        const prevData = prev.byAssetClass[cls]?.accounts.find((x) => x.account === a.account);
        const prevVal = prevData?.amount ?? 0;
        if (prevVal !== 0) {
          const changePct = ((a.amount - prevVal) / prevVal) * 100;
          if (Math.abs(changePct) >= thresholdPct) {
            warnings.push({
              monthKey: curr.monthKey,
              account: a.account,
              changePct,
              message: `${(changePct >= 0 ? "+" : "")}${changePct.toFixed(1)}%`,
            });
          }
        }
      }
    }
  }
  return warnings;
}

export function getMissingMonths(
  snapshots: MonthSnapshot[],
  fromKey: string,
  toKey: string
): string[] {
  const [fromY, fromM] = fromKey.split("-").map(Number);
  const [toY, toM] = toKey.split("-").map(Number);
  const have = new Set(snapshots.map((s) => s.monthKey));
  const missing: string[] = [];
  let y = fromY;
  let m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!have.has(key)) missing.push(key);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return missing;
}

export function getTreemapData(snapshot: MonthSnapshot): { name: string; children: { name: string; value: number }[]; value: number }[] {
  return Object.entries(snapshot.byAssetClass)
    .filter(([, d]) => d.total !== 0)
    .map(([cls, data]) => {
      const children = data.accounts
        .filter((a) => a.amount > 0)
        .map((a) => ({ name: a.account, value: a.amount }));
      return {
        name: cls,
        children,
        value: data.total,
      };
    })
    .sort((a, b) => b.value - a.value);
}
