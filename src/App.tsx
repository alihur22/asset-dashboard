import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
  Treemap,
} from "recharts";
import html2canvas from "html2canvas";
import {
  getStartOfMonthSnapshots,
  parseCsv,
  getMoMChange,
  getLargestMovers,
  getSparklineData,
  getMissingMonths,
  getTreemapData,
  buildTemplateFromSnapshot,
  getNextMonthKey,
  type SortBy,
  type DateFormat,
} from "./dataUtils";
import { fetchSheetAsCsv, type SheetConfig } from "./sheetApi";
import "./App.css";

/** Change this to your desired PIN, or set VITE_APP_PIN when building (e.g. VITE_APP_PIN=1234 npm run build) */
const DASHBOARD_PIN = import.meta.env.VITE_APP_PIN || "1234";

const DEFAULT_SHEET_CONFIG: SheetConfig = {
  spreadsheetId: "1HQ-ZJsis1fHrFSeM9DCTPtl9KHwhX6uwxrztW2-lmsA",
  sheetName: "Tidy_Data_Dashboard",
  apiKey: "",
};

function loadSheetConfig(): SheetConfig {
  try {
    const s = localStorage.getItem("asset-dashboard-sheet-config");
    if (!s) return DEFAULT_SHEET_CONFIG;
    const parsed = JSON.parse(s);
    return {
      spreadsheetId: String(parsed.spreadsheetId ?? DEFAULT_SHEET_CONFIG.spreadsheetId),
      sheetName: String(parsed.sheetName ?? DEFAULT_SHEET_CONFIG.sheetName),
      apiKey: String(parsed.apiKey ?? ""),
    };
  } catch {
    return DEFAULT_SHEET_CONFIG;
  }
}

const CHART_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#a855f7",
  "#14b8a6",
];

const ASSET_CLASS_COLORS: Record<string, string> = {
  Loan: "#e11d48",
  "Real Estate": "#059669",
};

type CurrencyMode = "pkr" | "usd";

function formatValue(v: number, currency: CurrencyMode, rate: number | null): string {
  const display = currency === "usd" && rate && rate > 0 ? v / rate : v;
  const m = display / 1e6;
  const sym = currency === "usd" && rate ? "$" : "Rs ";
  return `${sym}${(m).toFixed(2)}M`;
}

function formatValueShort(v: number, currency: CurrencyMode, rate: number | null): string {
  const display = currency === "usd" && rate && rate > 0 ? v / rate : v;
  const m = display / 1e6;
  const sym = currency === "usd" && rate ? "$" : "";
  if (m >= 1000) return `${sym}${(m / 1000).toFixed(1)}B`;
  return `${sym}${m.toFixed(1)}M`;
}

function convertForDisplay(v: number, currency: CurrencyMode, rate: number | null): number {
  if (currency === "usd" && rate && rate > 0) return v / rate;
  return v;
}

/** Format value already in display currency (e.g. from chart data) */
function formatDisplayValue(v: number, currency: CurrencyMode): string {
  const m = v / 1e6;
  const sym = currency === "usd" ? "$" : "Rs ";
  return `${sym}${m.toFixed(2)}M`;
}

function formatDisplayValueShort(v: number, currency: CurrencyMode): string {
  const m = v / 1e6;
  const sym = currency === "usd" ? "$" : "";
  if (m >= 1000) return `${sym}${(m / 1000).toFixed(1)}B`;
  return `${sym}${m.toFixed(1)}M`;
}

const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  color: "var(--tooltip-color)",
  padding: "8px 12px",
};

function Sparkline({ data, color = "#8b5cf6" }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  if (chartData.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={24}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const PIN_SESSION_KEY = "callgenics-dashboard-unlocked";

function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => sessionStorage.getItem(PIN_SESSION_KEY) === "1");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [compareMonth, setCompareMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("value");
  const [chartView, setChartView] = useState<"pie" | "treemap" | "stacked" | "bar">("pie");
  const [pieChartAssetClass, setPieChartAssetClass] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>(() =>
    (localStorage.getItem("asset-dashboard-currency") as CurrencyMode) || "pkr"
  );
  const [usdPkrRate, setUsdPkrRate] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("asset-dashboard-theme") as "light" | "dark") || "dark"
  );
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    () => (localStorage.getItem("asset-dashboard-date-format") as DateFormat) || "mmddyyyy"
  );
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>(loadSheetConfig);
  const [sheetConfigOpen, setSheetConfigOpen] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const moversRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);
  const expandedContentRef = useRef<HTMLDivElement>(null);

  type ExpandedSection = "overview" | "movers" | "chart" | "trend" | "compare" | "accounts" | null;
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [expandedAssetClasses, setExpandedAssetClasses] = useState<Set<string>>(new Set());

  const toggleAssetClass = (name: string) => {
    setExpandedAssetClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const exportSectionPng = async (ref: React.RefObject<HTMLDivElement | null>, name: string, useExpanded = false) => {
    const targetRef = useExpanded ? expandedContentRef : ref;
    if (!targetRef?.current) return;
    const canvas = await html2canvas(targetRef.current, {
      backgroundColor: theme === "dark" ? "#050308" : "#f8fafc",
      scale: 2,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-dashboard-${name.replace(/\s+/g, "-").toLowerCase()}-${currentMonth || "all"}.png`;
    a.click();
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("asset-dashboard-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("asset-dashboard-currency", currencyMode);
    } catch {
      /* ignore */
    }
  }, [currencyMode]);

  useEffect(() => {
    try {
      localStorage.setItem("asset-dashboard-date-format", dateFormat);
    } catch {
      /* ignore */
    }
  }, [dateFormat]);

  useEffect(() => {
    try {
      localStorage.setItem("asset-dashboard-sheet-config", JSON.stringify(sheetConfig));
    } catch {
      /* ignore */
    }
  }, [sheetConfig]);

  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json")
      .then((r) => r.json())
      .then((data: { usd?: { pkr?: number } }) => {
        const rate = data?.usd?.pkr;
        if (typeof rate === "number" && rate > 0) setUsdPkrRate(rate);
      })
      .catch(() => {
        /* fallback: use approximate rate if API fails */
        setUsdPkrRate(279);
      });
  }, []);

  const loadData = () => {
    setLoading(true);
    setError(null);
    if (!sheetConfig.apiKey) {
      setError("Google Sheet API key required. Open Data source settings.");
      setLoading(false);
      return;
    }
    fetchSheetAsCsv(sheetConfig)
      .then(setCsvContent)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Google Sheet"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const rawRows = useMemo(() => (csvContent ? parseCsv(csvContent, dateFormat) : []), [csvContent, dateFormat]);
  const snapshots = useMemo(() => {
    if (!csvContent) return [];
    return getStartOfMonthSnapshots(rawRows);
  }, [csvContent, rawRows]);

  const snapshotsWithEdits = useMemo(() => snapshots, [snapshots]);

  const filteredSnapshots = useMemo(() => snapshotsWithEdits, [snapshotsWithEdits]);

  const missingMonths = useMemo(() => {
    if (snapshots.length < 2) return [];
    const keys = snapshots.map((s) => s.monthKey).sort();
    const fromKey = keys[0];
    const toKey = keys[keys.length - 1];
    return getMissingMonths(snapshots, fromKey, toKey);
  }, [snapshots]);

  const currentMonth = selectedMonth || filteredSnapshots[filteredSnapshots.length - 1]?.monthKey || null;
  const currentSnapshot = useMemo(
    () => filteredSnapshots.find((s) => s.monthKey === currentMonth),
    [filteredSnapshots, currentMonth]
  );
  const compareSnapshot = useMemo(
    () => (compareMonth ? filteredSnapshots.find((s) => s.monthKey === compareMonth) : null),
    [filteredSnapshots, compareMonth]
  );

  const momChange = useMemo(
    () => (currentMonth ? getMoMChange(filteredSnapshots, currentMonth) : null),
    [filteredSnapshots, currentMonth]
  );

  const largestMovers = useMemo(
    () => (currentMonth ? getLargestMovers(filteredSnapshots, currentMonth, 8) : []),
    [filteredSnapshots, currentMonth]
  );

  const pieData = useMemo(() => {
    if (!currentSnapshot) return [];
    let data = Object.entries(currentSnapshot.byAssetClass)
      .map(([name, d]) => ({ name, value: convertForDisplay(d.total, currencyMode, usdPkrRate) }))
      .filter((d) => d.value !== 0);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (sortBy === "value") data.sort((a, b) => b.value - a.value);
    else if (sortBy === "name") data.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "change" && momChange) {
      data.sort((a, b) => {
        const ac = momChange.byClass[a.name]?.changePct ?? 0;
        const bc = momChange.byClass[b.name]?.changePct ?? 0;
        return Math.abs(bc) - Math.abs(ac);
      });
    }
    return data;
  }, [currentSnapshot, search, sortBy, momChange, currencyMode, usdPkrRate]);

  const PIE_TOP_N = 4;
  const PIE_MIN_PCT = 8;
  const pieChartData = useMemo(() => {
    if (pieData.length === 0) return [];
    const total = pieData.reduce((s, d) => s + d.value, 0);
    if (total <= 0) return [];
    const shown: { name: string; value: number }[] = [];
    let otherValue = 0;
    for (let i = 0; i < pieData.length; i++) {
      const d = pieData[i];
      const pct = (d.value / total) * 100;
      if (i < PIE_TOP_N && pct >= PIE_MIN_PCT) {
        shown.push(d);
      } else {
        otherValue += d.value;
      }
    }
    if (otherValue > 0) shown.push({ name: "Other", value: otherValue });
    return shown;
  }, [pieData]);

  const PIE_ACCOUNT_TOP_N = 8;
  const pieChartDataForDisplay = useMemo(() => {
    if (!currentSnapshot) return [];
    if (!pieChartAssetClass) return pieChartData;
    const classData = currentSnapshot.byAssetClass[pieChartAssetClass];
    if (!classData) return pieChartData;
    const accounts = classData.accounts
      .filter((a) => a.amount !== 0)
      .sort((a, b) => b.amount - a.amount)
      .map((a) => ({ name: a.account, value: convertForDisplay(a.amount, currencyMode, usdPkrRate) }));
    if (accounts.length === 0) return [];
    const total = accounts.reduce((s, d) => s + d.value, 0);
    if (total <= 0) return [];
    if (accounts.length <= PIE_ACCOUNT_TOP_N) return accounts;
    const shown = accounts.slice(0, PIE_ACCOUNT_TOP_N);
    const otherValue = accounts.slice(PIE_ACCOUNT_TOP_N).reduce((s, d) => s + d.value, 0);
    if (otherValue > 0) shown.push({ name: "Other", value: otherValue });
    return shown;
  }, [currentSnapshot, pieChartAssetClass, pieChartData, currencyMode, usdPkrRate]);

  const pieChartAssetClassOptions = useMemo(() => {
    if (!currentSnapshot) return [];
    return Object.keys(currentSnapshot.byAssetClass)
      .filter((cls) => (currentSnapshot.byAssetClass[cls]?.total ?? 0) > 0)
      .sort((a, b) => (currentSnapshot.byAssetClass[b]?.total ?? 0) - (currentSnapshot.byAssetClass[a]?.total ?? 0));
  }, [currentSnapshot]);

  useEffect(() => {
    if (pieChartAssetClass && currentSnapshot && !currentSnapshot.byAssetClass[pieChartAssetClass]) {
      setPieChartAssetClass(null);
    }
  }, [pieChartAssetClass, currentSnapshot]);

  const filteredAccounts = useMemo(() => {
    if (!currentSnapshot) return [];
    const items: { account: string; assetClass: string; amount: number }[] = [];
    for (const [cls, data] of Object.entries(currentSnapshot.byAssetClass)) {
      for (const a of data.accounts) {
        if (a.amount === 0) continue;
        if (search) {
          const q = search.toLowerCase();
          if (!a.account.toLowerCase().includes(q) && !cls.toLowerCase().includes(q)) continue;
        }
        items.push({ account: a.account, assetClass: cls, amount: a.amount });
      }
    }
    if (sortBy === "value") items.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "name") items.sort((a, b) => a.account.localeCompare(b.account));
    return items;
  }, [currentSnapshot, search, sortBy]);

  const trendData = useMemo(() => {
    return filteredSnapshots.map((s) => ({
      month: s.label,
      total: convertForDisplay(s.totalValue, currencyMode, usdPkrRate),
      key: s.monthKey,
    }));
  }, [filteredSnapshots, currencyMode, usdPkrRate]);

  const stackedAreaData = useMemo(() => {
    const classes = new Set<string>();
    for (const s of filteredSnapshots) {
      for (const cls of Object.keys(s.byAssetClass)) {
        classes.add(cls);
      }
    }
    return filteredSnapshots.map((s) => {
      const row: Record<string, number | string> = { month: s.label, key: s.monthKey };
      for (const cls of classes) {
        const val = s.byAssetClass[cls]?.total ?? 0;
        row[cls] = convertForDisplay(val, currencyMode, usdPkrRate);
      }
      return row;
    });
  }, [filteredSnapshots, currencyMode, usdPkrRate]);

  const barData = useMemo(() => {
    if (!currentSnapshot) return [];
    const items: { name: string; value: number }[] = [];
    for (const [, data] of Object.entries(currentSnapshot.byAssetClass)) {
      for (const a of data.accounts) {
        if (a.amount > 0) items.push({ name: a.account.length > 20 ? a.account.slice(0, 18) + "…" : a.account, value: convertForDisplay(a.amount, currencyMode, usdPkrRate) });
      }
    }
    return items.sort((a, b) => b.value - a.value).slice(0, 15);
  }, [currentSnapshot, currencyMode, usdPkrRate]);

  const treemapData = useMemo(() => {
    if (!currentSnapshot) return [];
    const raw = getTreemapData(currentSnapshot);
    if (currencyMode !== "usd" || !usdPkrRate) return raw;
    return raw.map((node) => ({
      ...node,
      value: node.value / usdPkrRate,
      children: node.children.map((c) => ({ ...c, value: c.value / usdPkrRate })),
    }));
  }, [currentSnapshot, currencyMode, usdPkrRate]);

  const exportCsv = () => {
    if (!currentSnapshot) return;
    const rows = ["Account,Asset Class,Amount (Rs),Amount (M)"];
    for (const r of currentSnapshot.rows) {
      rows.push(`${r.account},${r.assetClass},${r.amountRs},${(r.amountRs / 1e6).toFixed(2)}`);
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-dashboard-${currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllData = () => {
    if (!csvContent) return;
    const content = csvContent;
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.csv";
    a.click();
    URL.revokeObjectURL(url);
    setUploadMessage("Full data exported.");
    setTimeout(() => setUploadMessage(null), 4000);
  };

  const exportPng = async () => {
    if (!dashboardRef.current) return;
    const canvas = await html2canvas(dashboardRef.current, {
      backgroundColor: theme === "dark" ? "#050308" : "#f8fafc",
      scale: 2,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-dashboard-full-${currentMonth}.png`;
    a.click();
  };

  const copyTemplateFromLastMonth = () => {
    const lastSnapshot = filteredSnapshots[filteredSnapshots.length - 1];
    if (!lastSnapshot || !csvContent) return;
    const nextKey = getNextMonthKey(lastSnapshot.monthKey);
    const template = buildTemplateFromSnapshot(lastSnapshot, nextKey, dateFormat);
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${nextKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setUploadMessage(`Template for ${nextKey} downloaded. Add to your Google Sheet for the new month.`);
    setTimeout(() => setUploadMessage(null), 4000);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    if (pinInput === DASHBOARD_PIN) {
      sessionStorage.setItem(PIN_SESSION_KEY, "1");
      setIsUnlocked(true);
      setPinInput("");
    } else {
      setPinError("Incorrect PIN");
    }
  };

  if (!isUnlocked) {
    return (
      <div className="app pin-gate">
        <div className="pin-gate-card">
          <h1>CallGenics Dashboard</h1>
          <p className="pin-gate-muted">Enter PIN to continue</p>
          <form onSubmit={handlePinSubmit} className="pin-form">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError("");
              }}
              className="pin-input"
              autoFocus
            />
            {pinError && <p className="pin-error">{pinError}</p>}
            <button type="submit" className="pin-submit">
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading && !csvContent) {
    return (
      <div className="app">
        <div className="loading">Loading data…</div>
      </div>
    );
  }

  return (
    <div className="app" ref={dashboardRef}>
      <header className="header">
        <div>
          <h1>CallGenics Dashboard</h1>
          <p>Standing of all asset classes at the start of each month</p>
        </div>
        <div className="header-actions">
          <label className="theme-toggle" title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
            <button
              type="button"
              className="theme-btn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </label>
          <label className="currency-toggle">
            <span className="currency-label">Date</span>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              title="Date format in CSV: DD/MM (e.g. 02/09/2024) or MM/DD (e.g. 09/02/2024)"
            >
              <option value="ddmmyyyy">DD/MM (PK, UK)</option>
              <option value="mmddyyyy">MM/DD (US)</option>
            </select>
          </label>
          <label className="currency-toggle">
            <span className="currency-label">Currency</span>
            <select
              value={currencyMode}
              onChange={(e) => setCurrencyMode(e.target.value as CurrencyMode)}
              title={usdPkrRate ? `1 USD = ${usdPkrRate.toFixed(2)} PKR` : "Loading rate…"}
            >
              <option value="pkr">PKR (Rs)</option>
              <option value="usd">USD ($)</option>
            </select>
            {currencyMode === "usd" && usdPkrRate && (
              <span className="rate-badge" title="Real-time rate">1$ = {usdPkrRate.toFixed(0)} Rs</span>
            )}
          </label>
          <button type="button" className="btn-refresh" onClick={loadData} disabled={loading} title="Reload data">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn-expand"
            onClick={() => setSheetConfigOpen((v) => !v)}
            title="Data source settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {sheetConfigOpen && (
        <div className="sheet-config-panel">
          <h4>Google Sheet connection</h4>
          <p className="muted">Get an API key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>: create a project → enable Sheets API → create API key. Share your sheet with &quot;Anyone with the link&quot; (Viewer).</p>
          <div className="sheet-config-fields">
            <label className="control-label">
              Spreadsheet ID
              <input
                type="text"
                value={sheetConfig.spreadsheetId}
                onChange={(e) => setSheetConfig((c) => ({ ...c, spreadsheetId: e.target.value }))}
                placeholder="From URL: docs.google.com/.../d/ID_HERE/edit"
              />
            </label>
            <label className="control-label">
              Sheet name
              <input
                type="text"
                value={sheetConfig.sheetName}
                onChange={(e) => setSheetConfig((c) => ({ ...c, sheetName: e.target.value }))}
                placeholder="e.g. Tidy_Data_Dashboard"
              />
            </label>
            <label className="control-label">
              API key
              <input
                type="password"
                value={sheetConfig.apiKey}
                onChange={(e) => setSheetConfig((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="Your Google API key"
              />
            </label>
          </div>
          <button type="button" className="btn-export" onClick={() => { setSheetConfigOpen(false); loadData(); }}>
            Save & reload
          </button>
        </div>
      )}

      {error && (
        <div className="warning-banner" role="alert">
          <span className="warning-icon">⚠</span>
          {error}
          <button type="button" className="btn-refresh" onClick={loadData} style={{ marginLeft: "0.5rem" }}>
            Retry
          </button>
        </div>
      )}

      {!csvContent && !loading && (
        <div className="error" style={{ padding: "2rem", textAlign: "center" }}>
          No data loaded. Configure Google Sheet in settings (⚙) above.
        </div>
      )}

      {csvContent && (
      <>
      <div className="controls-wrapper">
        <button
          type="button"
          className="controls-toggle"
          onClick={() => setMobileControlsOpen((v) => !v)}
          aria-expanded={mobileControlsOpen}
        >
          {mobileControlsOpen ? "Hide filters" : "Filters & actions"}
          <span className="controls-toggle-icon">{mobileControlsOpen ? "▲" : "▼"}</span>
        </button>
        <div className={`controls ${mobileControlsOpen ? "controls-open" : ""}`}>
        <div className="control-row">
          <label className="control-label">
            Search
            <input
              type="text"
              placeholder="Account or asset class..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="control-label">
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="value">Value</option>
              <option value="name">Name</option>
              <option value="change">Change</option>
            </select>
          </label>
        </div>
        <div className="control-row">
          <button type="button" className="btn-export" onClick={exportCsv} title="Export current month only">
            Export month
          </button>
          <button type="button" className="btn-export" onClick={exportAllData} title="Export all data">
            Export all
          </button>
          <button type="button" className="btn-export" onClick={exportPng}>
            Export PNG
          </button>
          <button type="button" className="btn-template" onClick={copyTemplateFromLastMonth} title="Download next month's template with last month's values">
            Copy from last month
          </button>
        </div>
        </div>
      </div>

      {uploadMessage && (
        <div className="upload-message">{uploadMessage}</div>
      )}

      {missingMonths.length > 0 && (
        <div className="warning-banner">
          <span className="warning-icon">⚠</span>
          Missing data for: {missingMonths.map((m) => m.replace("-", " ")).join(", ")}
        </div>
      )}

      <div className="month-select">
        <label className="control-label">
          Month
          <select
            value={currentMonth || ""}
            onChange={(e) => setSelectedMonth(e.target.value || null)}
            className="month-dropdown"
          >
            {filteredSnapshots.map((s) => (
              <option key={s.monthKey} value={s.monthKey}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="compare-row">
        <label className="control-label">
          Compare with
          <select
            value={compareMonth || ""}
            onChange={(e) => setCompareMonth(e.target.value || null)}
          >
            <option value="">— None —</option>
            {filteredSnapshots
              .filter((s) => s.monthKey !== currentMonth)
              .map((s) => (
                <option key={s.monthKey} value={s.monthKey}>
                  {s.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="chart-view-tabs">
        {(["pie", "treemap", "stacked", "bar"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={chartView === v ? "active" : ""}
            onClick={() => setChartView(v)}
          >
            {v === "pie" && "Pie"}
            {v === "treemap" && "Hierarchy"}
            {v === "stacked" && "Stacked"}
            {v === "bar" && "Top Accounts"}
          </button>
        ))}
      </div>

      <div className="dashboard">
        <aside className="sidebar left">
          <div className="panel" ref={overviewRef}>
            <div className="panel-header">
              <h3>Asset Class Overview</h3>
              <div className="panel-actions">
                <button type="button" className="btn-expand" onClick={() => setExpandedSection("overview")} title="Expand">⛶</button>
                <button type="button" className="btn-download-png" onClick={() => exportSectionPng(overviewRef, "Asset Class Overview")} title="Download as PNG">⬇ PNG</button>
              </div>
            </div>
            <p className="muted">Total value and breakdown for {currentSnapshot?.label ?? "selected month"}.</p>
            {currentSnapshot && (
              <>
                <div className="stat-block">
                  <span className="stat-label">Total Value</span>
                  <span className="stat-value">{formatValue(currentSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                  {momChange && (
                    <span
                      className={`stat-change ${momChange.totalChange >= 0 ? "positive" : "negative"}`}
                      title={`vs ${filteredSnapshots[filteredSnapshots.findIndex((s) => s.monthKey === currentMonth) - 1]?.label ?? "prior"}`}
                    >
                      {momChange.totalChange >= 0 ? "↑" : "↓"} {Math.abs(momChange.totalChangePct).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="list-title">By Asset Class</div>
                <ul className="asset-list">
                  {pieData.map((d, i) => {
                    const pct =
                      currentSnapshot.totalValue > 0
                        ? ((d.value / currentSnapshot.totalValue) * 100).toFixed(1)
                        : "0";
                    const change = momChange?.byClass[d.name];
                    const isExpanded = expandedAssetClasses.has(d.name);
                    const accounts = currentSnapshot.byAssetClass[d.name]?.accounts ?? [];
                    const displayAccounts = accounts.filter((a) => a.amount !== 0).sort((a, b) => b.amount - a.amount);
                    return (
                      <li
                        key={d.name}
                        className={`asset-list-item ${isExpanded ? "expanded" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleAssetClass(d.name)}
                        onKeyDown={(e) => e.key === "Enter" && toggleAssetClass(d.name)}
                        aria-expanded={isExpanded}
                        aria-label={`${d.name}, ${pct}%, click to ${isExpanded ? "collapse" : "expand"} accounts`}
                      >
                        <div className="asset-list-main">
                          <span className="asset-expand-icon" aria-hidden>{isExpanded ? "▾" : "▸"}</span>
                          <span className="dot" style={{ background: ASSET_CLASS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span>
                            {d.name}: {pct}% ({formatDisplayValueShort(d.value, currencyMode)})
                          </span>
                          {change && (
                            <span
                              className={`change-indicator ${change.changePct >= 0 ? "positive" : "negative"}`}
                              title={formatValue(change.change, currencyMode, usdPkrRate)}
                            >
                              {change.changePct >= 0 ? "↑" : "↓"} {Math.abs(change.changePct).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {isExpanded && displayAccounts.length > 0 && (
                          <ul className="asset-accounts-sublist" onClick={(e) => e.stopPropagation()}>
                            {displayAccounts.map((a) => (
                              <li key={a.account}>
                                <span className="account-name">{a.account}</span>
                                <span className="account-amount">{formatValueShort(a.amount, currencyMode, usdPkrRate)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="sparkline-wrap">
                          <Sparkline data={getSparklineData(filteredSnapshots, d.name, false).map((v) => convertForDisplay(v, currencyMode, usdPkrRate))} color={ASSET_CLASS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {largestMovers.length > 0 && (
            <div className="panel" ref={moversRef}>
              <div className="panel-header">
                <h3>Largest Movers</h3>
                <div className="panel-actions">
                  <button type="button" className="btn-expand" onClick={() => setExpandedSection("movers")} title="Expand">⛶</button>
                  <button type="button" className="btn-download-png" onClick={() => exportSectionPng(moversRef, "Largest Movers")} title="Download as PNG">⬇ PNG</button>
                </div>
              </div>
              <p className="muted">Biggest changes vs previous month.</p>
              <ul className="movers-list">
                {largestMovers.map((m) => (
                  <li key={m.account}>
                    <span className="mover-name">{m.account}</span>
                    <span className={`mover-change ${m.change >= 0 ? "positive" : "negative"}`}>
                      {m.change >= 0 ? "+" : ""}{formatValueShort(m.change, currencyMode, usdPkrRate)} ({m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(1)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <main className="center">
          {compareMonth && compareSnapshot && currentSnapshot && (
            <div className="panel compare-panel" ref={compareRef}>
              <div className="panel-header">
                <h3>Compare: {currentSnapshot.label} vs {compareSnapshot.label}</h3>
                <div className="panel-actions">
                  <button type="button" className="btn-expand" onClick={() => setExpandedSection("compare")} title="Expand">⛶</button>
                  <button type="button" className="btn-download-png" onClick={() => exportSectionPng(compareRef, "Compare")} title="Download as PNG">⬇ PNG</button>
                </div>
              </div>
              <div className="compare-stats">
                <div>
                  <span className="compare-label">Total</span>
                  <span>{formatValue(currentSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                  <span className="muted">vs {formatValue(compareSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                </div>
                <div>
                  <span className="compare-label">Diff</span>
                  <span className={currentSnapshot.totalValue >= compareSnapshot.totalValue ? "positive" : "negative"}>
                    {formatValue(currentSnapshot.totalValue - compareSnapshot.totalValue, currencyMode, usdPkrRate)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="panel chart-panel" ref={chartRef}>
            <div className="panel-header">
              <h3>
                {chartView === "pie" && `Asset Allocation${currentSnapshot ? ` — ${currentSnapshot.label}` : ""}`}
                {chartView === "treemap" && "Hierarchy (Asset Class → Account)"}
                {chartView === "stacked" && "Asset Classes Over Time"}
                {chartView === "bar" && "Top 15 Accounts by Value"}
              </h3>
              <div className="panel-actions">
                {chartView === "pie" && currentSnapshot && pieChartAssetClassOptions.length > 0 && (
                  <select
                    className="pie-chart-asset-select"
                    value={pieChartAssetClass ?? ""}
                    onChange={(e) => setPieChartAssetClass(e.target.value || null)}
                    title="View by asset class or drill into accounts"
                  >
                    <option value="">All (by asset class)</option>
                    {pieChartAssetClassOptions.map((cls) => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn-expand" onClick={() => setExpandedSection("chart")} title="Expand">⛶</button>
                <button type="button" className="btn-download-png" onClick={() => exportSectionPng(chartRef, chartView === "pie" ? "Asset Allocation" : chartView === "treemap" ? "Hierarchy" : chartView === "stacked" ? "Asset Classes Over Time" : "Top Accounts")} title="Download as PNG">⬇ PNG</button>
              </div>
            </div>
            {chartView === "pie" && pieChartDataForDisplay.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart margin={{ top: 8, right: 16, bottom: 48, left: 16 }}>
                  <Pie
                    data={pieChartDataForDisplay}
                    cx="50%"
                    cy="42%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                    isAnimationActive={false}
                  >
                    {pieChartDataForDisplay.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={ASSET_CLASS_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth={1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [formatDisplayValue(Number(v ?? 0), currencyMode), String(name ?? "")]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    formatter={(value) => {
                      const item = pieChartDataForDisplay.find((d) => d.name === value);
                      const total = pieChartDataForDisplay.reduce((s, d) => s + d.value, 0);
                      const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                      return `${value} ${pct}%`;
                    }}
                    wrapperStyle={{ fontSize: "0.8rem" }}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {chartView === "treemap" && treemapData.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  nameKey="name"
                  aspectRatio={4 / 3}
                  stroke="rgba(0,0,0,0.2)"
                  content={(props: { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number }) => {
                    const { x = 0, y = 0, width = 0, height = 0, name = "", value = 0 } = props;
                    const idx = treemapData.findIndex((d) => d.name === name || d.children?.some((c) => c.name === name));
                    const fill = CHART_COLORS[Math.max(0, idx) % CHART_COLORS.length];
                    return (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill={fill} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
                        {width > 40 && height > 24 && (
                          <>
                            <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) + (height ?? 0) / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11}>
                              {name}
                            </text>
                            <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) + (height ?? 0) / 2 + 6} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}>
                              {typeof value === "number" ? formatDisplayValueShort(value, currencyMode) : ""}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  }}
                />
              </ResponsiveContainer>
            )}
            {chartView === "stacked" && stackedAreaData.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={stackedAreaData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                  <Tooltip
                    formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  {Object.keys(stackedAreaData[0] || {})
                    .filter((k) => k !== "month" && k !== "key")
                    .map((k, i) => (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        stackId="1"
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.6}
                      />
                    ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
            {chartView === "bar" && barData.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 8, left: 80, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9 }} stroke="#9ca3af" />
                  <Tooltip formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {((chartView === "pie" && pieChartDataForDisplay.length === 0) ||
              (chartView === "treemap" && treemapData.length === 0) ||
              (chartView === "stacked" && stackedAreaData.length === 0) ||
              (chartView === "bar" && barData.length === 0)) && (
              <div className="empty-chart">No data for this view</div>
            )}
          </div>

          <div className="panel" ref={trendRef}>
            <div className="panel-header">
              <h3>Net Worth Trend</h3>
              <div className="panel-actions">
                <button type="button" className="btn-expand" onClick={() => setExpandedSection("trend")} title="Expand">⛶</button>
                <button type="button" className="btn-download-png" onClick={() => exportSectionPng(trendRef, "Net Worth Trend")} title="Download as PNG">⬇ PNG</button>
              </div>
            </div>
            <p className="muted">Total value at start of each month.</p>
            {trendData.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                  <Tooltip
                    formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="url(#areaGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </main>

        <aside className="sidebar right">
          <div className="panel" ref={accountsRef}>
            <div className="panel-header">
              <h3>Accounts by Class</h3>
              <div className="panel-actions">
                <button type="button" className="btn-expand" onClick={() => setExpandedSection("accounts")} title="Expand">⛶</button>
                <button type="button" className="btn-download-png" onClick={() => exportSectionPng(accountsRef, "Accounts by Class")} title="Download as PNG">⬇ PNG</button>
              </div>
            </div>
            <p className="muted">Expand to see accounts. Hover for details.</p>
            <div className="accounts-scroll">
                {currentSnapshot &&
                Object.entries(currentSnapshot.byAssetClass)
                  .filter(([, d]) => d.total !== 0)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([cls, data]) => (
                    <details key={cls} className="account-group">
                      <summary title={`${cls}: ${formatValue(data.total, currencyMode, usdPkrRate)}`}>
                        <span className="class-name">{cls}</span>
                        <span className="class-total">{formatValueShort(data.total, currencyMode, usdPkrRate)}</span>
                      </summary>
                      <ul>
                        {data.accounts
                          .filter((a) => a.amount !== 0)
                          .sort((a, b) => b.amount - a.amount)
                          .map((a) => (
                            <li key={a.account} title={`${a.account}: ${formatValue(a.amount, currencyMode, usdPkrRate)}`}>
                              <span>{a.account}</span>
                              <span>{formatValueShort(a.amount, currencyMode, usdPkrRate)}</span>
                              <div className="account-sparkline">
                                <Sparkline data={getSparklineData(filteredSnapshots, a.account, true).map((v) => convertForDisplay(v, currencyMode, usdPkrRate))} color="#8b5cf6" />
                              </div>
                            </li>
                          ))}
                      </ul>
                    </details>
                  ))}
              {search && filteredAccounts.length === 0 && (
                <div className="muted">No accounts match &quot;{search}&quot;</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {expandedSection &&
        createPortal(
          <div className="expand-overlay" onClick={() => setExpandedSection(null)}>
            <div className="expand-backdrop" aria-hidden />
            <div
              className="expand-content"
              ref={expandedContentRef}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "75vw", height: "75vh" }}
            >
              <div className="expand-content-header">
                <button type="button" className="btn-expand-close" onClick={() => setExpandedSection(null)} title="Close">✕</button>
                <button
                  type="button"
                  className="btn-download-png"
                  onClick={() =>
                    exportSectionPng(
                      null as unknown as React.RefObject<HTMLDivElement>,
                      expandedSection === "chart"
                        ? chartView === "pie"
                          ? "Asset Allocation"
                          : chartView === "treemap"
                            ? "Hierarchy"
                            : chartView === "stacked"
                              ? "Asset Classes Over Time"
                              : "Top Accounts"
                        : expandedSection === "overview"
                          ? "Asset Class Overview"
                          : expandedSection === "movers"
                            ? "Largest Movers"
                            : expandedSection === "trend"
                              ? "Net Worth Trend"
                              : expandedSection === "compare"
                                ? "Compare"
                                : "Accounts by Class",
                      true
                    )
                  }
                  title="Download as PNG (expanded size)"
                >
                  ⬇ PNG
                </button>
              </div>
              <div className="expand-content-body">
                {expandedSection === "overview" && currentSnapshot && (
                  <div className="panel expand-panel">
                    <h3>Asset Class Overview</h3>
                    <p className="muted">Total value and breakdown for {currentSnapshot.label}.</p>
                    <div className="stat-block">
                      <span className="stat-label">Total Value</span>
                      <span className="stat-value">{formatValue(currentSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                      {momChange && (
                        <span className={`stat-change ${momChange.totalChange >= 0 ? "positive" : "negative"}`}>
                          {momChange.totalChange >= 0 ? "↑" : "↓"} {Math.abs(momChange.totalChangePct).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="list-title">By Asset Class</div>
                    <ul className="asset-list">
                      {pieData.map((d, i) => {
                        const pct = currentSnapshot.totalValue > 0 ? ((d.value / currentSnapshot.totalValue) * 100).toFixed(1) : "0";
                        const change = momChange?.byClass[d.name];
                        const isExpanded = expandedAssetClasses.has(d.name);
                        const accounts = currentSnapshot.byAssetClass[d.name]?.accounts ?? [];
                        const displayAccounts = accounts.filter((a) => a.amount !== 0).sort((a, b) => b.amount - a.amount);
                        return (
                          <li
                            key={d.name}
                            className={`asset-list-item ${isExpanded ? "expanded" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleAssetClass(d.name)}
                            onKeyDown={(e) => e.key === "Enter" && toggleAssetClass(d.name)}
                            aria-expanded={isExpanded}
                          >
                            <div className="asset-list-main">
                              <span className="asset-expand-icon" aria-hidden>{isExpanded ? "▾" : "▸"}</span>
                              <span className="dot" style={{ background: ASSET_CLASS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span>{d.name}: {pct}% ({formatDisplayValueShort(d.value, currencyMode)})</span>
                              {change && (
                                <span className={`change-indicator ${change.changePct >= 0 ? "positive" : "negative"}`}>
                                  {change.changePct >= 0 ? "↑" : "↓"} {Math.abs(change.changePct).toFixed(1)}%
                                </span>
                              )}
                            </div>
                            {isExpanded && displayAccounts.length > 0 && (
                              <ul className="asset-accounts-sublist" onClick={(e) => e.stopPropagation()}>
                                {displayAccounts.map((a) => (
                                  <li key={a.account}>
                                    <span className="account-name">{a.account}</span>
                                    <span className="account-amount">{formatValueShort(a.amount, currencyMode, usdPkrRate)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="sparkline-wrap">
                              <Sparkline data={getSparklineData(filteredSnapshots, d.name, false).map((v) => convertForDisplay(v, currencyMode, usdPkrRate))} color={ASSET_CLASS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {expandedSection === "movers" && largestMovers.length > 0 && (
                  <div className="panel expand-panel">
                    <h3>Largest Movers</h3>
                    <p className="muted">Biggest changes vs previous month.</p>
                    <ul className="movers-list">
                      {largestMovers.map((m) => (
                        <li key={m.account}>
                          <span className="mover-name">{m.account}</span>
                          <span className={`mover-change ${m.change >= 0 ? "positive" : "negative"}`}>
                            {m.change >= 0 ? "+" : ""}{formatValueShort(m.change, currencyMode, usdPkrRate)} ({m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(1)}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {expandedSection === "chart" && (
                  <div className="panel chart-panel expand-panel expand-chart-panel">
                    <div className="expand-chart-header">
                      <h3>
                        {chartView === "pie" && `Asset Allocation${currentSnapshot ? ` — ${currentSnapshot.label}` : ""}`}
                        {chartView === "treemap" && "Hierarchy (Asset Class → Account)"}
                        {chartView === "stacked" && "Asset Classes Over Time"}
                        {chartView === "bar" && "Top 15 Accounts by Value"}
                      </h3>
                      {chartView === "pie" && currentSnapshot && pieChartAssetClassOptions.length > 0 && (
                        <select
                          className="pie-chart-asset-select"
                          value={pieChartAssetClass ?? ""}
                          onChange={(e) => setPieChartAssetClass(e.target.value || null)}
                          title="View by asset class or drill into accounts"
                        >
                          <option value="">All (by asset class)</option>
                          {pieChartAssetClassOptions.map((cls) => (
                            <option key={cls} value={cls}>{cls}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {chartView === "pie" && pieChartDataForDisplay.length > 0 && (
                      <ResponsiveContainer width="100%" height={450}>
                        <PieChart margin={{ top: 8, right: 16, bottom: 56, left: 16 }}>
                          <Pie data={pieChartDataForDisplay} cx="50%" cy="42%" innerRadius={90} outerRadius={140} paddingAngle={5} dataKey="value" nameKey="name" isAnimationActive={false}>
                            {pieChartDataForDisplay.map((entry, i) => (
                              <Cell key={entry.name} fill={ASSET_CLASS_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown, name: unknown) => [formatDisplayValue(Number(v ?? 0), currencyMode), String(name ?? "")]} contentStyle={TOOLTIP_STYLE} />
                          <Legend layout="horizontal" align="center" verticalAlign="bottom" formatter={(value) => {
                            const item = pieChartDataForDisplay.find((d) => d.name === value);
                            const total = pieChartDataForDisplay.reduce((s, d) => s + d.value, 0);
                            const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                            return `${value} ${pct}%`;
                          }} wrapperStyle={{ fontSize: "0.85rem" }} iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                    {chartView === "treemap" && treemapData.length > 0 && (
                      <ResponsiveContainer width="100%" height={450}>
                        <Treemap data={treemapData} dataKey="value" nameKey="name" aspectRatio={4 / 3} stroke="rgba(0,0,0,0.2)" content={(props: { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number }) => {
                          const { x = 0, y = 0, width = 0, height = 0, name = "", value = 0 } = props;
                          const idx = treemapData.findIndex((d) => d.name === name || d.children?.some((c) => c.name === name));
                          const fill = CHART_COLORS[Math.max(0, idx) % CHART_COLORS.length];
                          return (
                            <g>
                              <rect x={x} y={y} width={width} height={height} fill={fill} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
                              {width > 40 && height > 24 && (
                                <>
                                  <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) + (height ?? 0) / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11}>{name}</text>
                                  <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) + (height ?? 0) / 2 + 6} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}>{typeof value === "number" ? formatDisplayValueShort(value, currencyMode) : ""}</text>
                                </>
                              )}
                            </g>
                          );
                        }} />
                      </ResponsiveContainer>
                    )}
                    {chartView === "stacked" && stackedAreaData.length > 0 && (
                      <ResponsiveContainer width="100%" height={450}>
                        <AreaChart data={stackedAreaData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                          <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                          <Tooltip formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)} contentStyle={TOOLTIP_STYLE} />
                          {Object.keys(stackedAreaData[0] || {}).filter((k) => k !== "month" && k !== "key").map((k, i) => (
                            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                    {chartView === "bar" && barData.length > 0 && (
                      <ResponsiveContainer width="100%" height={450}>
                        <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 8, left: 80, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                          <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9 }} stroke="#9ca3af" />
                          <Tooltip formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)} contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {((chartView === "pie" && pieChartDataForDisplay.length === 0) ||
                      (chartView === "treemap" && treemapData.length === 0) ||
                      (chartView === "stacked" && stackedAreaData.length === 0) ||
                      (chartView === "bar" && barData.length === 0)) && (
                      <div className="empty-chart">No data for this view</div>
                    )}
                  </div>
                )}
                {expandedSection === "trend" && trendData.length > 0 && (
                  <div className="panel expand-panel">
                    <h3>Net Worth Trend</h3>
                    <p className="muted">Total value at start of each month.</p>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                        <defs>
                          <linearGradient id="areaGradExpand" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatDisplayValueShort(v, currencyMode)} />
                        <Tooltip formatter={(v: unknown) => formatDisplayValue(Number(v ?? 0), currencyMode)} contentStyle={TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="url(#areaGradExpand)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {expandedSection === "compare" && compareSnapshot && currentSnapshot && (
                  <div className="panel compare-panel expand-panel">
                    <h3>Compare: {currentSnapshot.label} vs {compareSnapshot.label}</h3>
                    <div className="compare-stats">
                      <div>
                        <span className="compare-label">Total</span>
                        <span>{formatValue(currentSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                        <span className="muted">vs {formatValue(compareSnapshot.totalValue, currencyMode, usdPkrRate)}</span>
                      </div>
                      <div>
                        <span className="compare-label">Diff</span>
                        <span className={currentSnapshot.totalValue >= compareSnapshot.totalValue ? "positive" : "negative"}>
                          {formatValue(currentSnapshot.totalValue - compareSnapshot.totalValue, currencyMode, usdPkrRate)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {expandedSection === "accounts" && currentSnapshot && (
                  <div className="panel expand-panel">
                    <h3>Accounts by Class</h3>
                    <p className="muted">Expand to see accounts. Hover for details.</p>
                    <div className="accounts-scroll">
                      {Object.entries(currentSnapshot.byAssetClass)
                        .filter(([, d]) => d.total !== 0)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([cls, data]) => (
                          <details key={cls} className="account-group">
                            <summary title={`${cls}: ${formatValue(data.total, currencyMode, usdPkrRate)}`}>
                              <span className="class-name">{cls}</span>
                              <span className="class-total">{formatValueShort(data.total, currencyMode, usdPkrRate)}</span>
                            </summary>
                            <ul>
                              {data.accounts.filter((a) => a.amount !== 0).sort((a, b) => b.amount - a.amount).map((a) => (
                                <li key={a.account} title={`${a.account}: ${formatValue(a.amount, currencyMode, usdPkrRate)}`}>
                                  <span>{a.account}</span>
                                  <span>{formatValueShort(a.amount, currencyMode, usdPkrRate)}</span>
                                  <div className="account-sparkline">
                                    <Sparkline data={getSparklineData(filteredSnapshots, a.account, true).map((v) => convertForDisplay(v, currencyMode, usdPkrRate))} color="#8b5cf6" />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
      )}
    </div>
  );
}

export default App;
