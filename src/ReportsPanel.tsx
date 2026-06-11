import { useMemo, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import html2canvas from "html2canvas";
import type { MonthSnapshot } from "./dataUtils";
import {
  getLiquidVsIlliquid,
  getRealEstateBreakdown,
  getGeographicSplit,
  getAssetsVsLiabilities,
  getMoMWaterfall,
  getConcentrationReport,
  getRealEstateTrend,
  getFundBankBreakdown,
  getTargetVsActual,
  getYoYCompare,
  getSummaryScorecard,
  getRealEstateLedger,
  getDebtLoanReport,
  getIncomeVsCapital,
  getAccountHeatmapData,
  type PieSlice,
} from "./reportUtils";

const CHART_COLORS = [
  "#8b5cf6", "#ec4899", "#3b82f6", "#22c55e", "#f59e0b",
  "#06b6d4", "#84cc16", "#f97316", "#a855f7", "#14b8a6", "#e11d48", "#059669",
];

const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  color: "var(--tooltip-color)",
  padding: "8px 12px",
};

interface ReportsPanelProps {
  snapshots: MonthSnapshot[];
  currentMonth: string | null;
  currentSnapshot: MonthSnapshot | undefined;
  theme: "light" | "dark";
  formatValue: (v: number) => string;
  formatValueShort: (v: number) => string;
  convert: (v: number) => number;
}

function toDisplaySlices(slices: PieSlice[], convert: (v: number) => number): PieSlice[] {
  return slices.map((s) => ({ name: s.name, value: convert(s.value) }));
}

function ReportPie({
  data,
  height = 220,
  innerRadius = 0,
  formatValue,
}: {
  data: PieSlice[];
  height?: number;
  innerRadius?: number;
  formatValue: (v: number) => string;
}) {
  if (data.length === 0) return <div className="empty-chart">No data</div>;
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 4, right: 8, bottom: 36, left: 8 }}>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={innerRadius}
          outerRadius={innerRadius > 0 ? 70 : 80}
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="rgba(0,0,0,0.2)" />
          ))}
        </Pie>
        <Tooltip formatter={(v: unknown, name: unknown) => [formatValue(Number(v ?? 0)), String(name ?? "")]} contentStyle={TOOLTIP_STYLE} />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          formatter={(value) => {
            const item = data.find((d) => d.name === value);
            const pct = item && total > 0 ? ((Math.abs(item.value) / total) * 100).toFixed(1) : "0";
            return `${value} ${pct}%`;
          }}
          wrapperStyle={{ fontSize: "0.72rem" }}
          iconSize={7}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function ReportsPanel({
  snapshots,
  currentMonth,
  currentSnapshot,
  theme,
  formatValue,
  formatValueShort,
  convert,
}: ReportsPanelProps) {
  const monthlyReportRef = useRef<HTMLDivElement>(null);

  const liquidData = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getLiquidVsIlliquid(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const rePieData = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getRealEstateBreakdown(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const geoData = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getGeographicSplit(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const assetsLiabData = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getAssetsVsLiabilities(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const waterfallData = useMemo(
    () => (currentMonth ? toDisplaySlices(getMoMWaterfall(snapshots, currentMonth), convert) : []),
    [snapshots, currentMonth, convert]
  );
  const concentration = useMemo(
    () => (currentSnapshot ? getConcentrationReport(currentSnapshot) : null),
    [currentSnapshot]
  );
  const reTrend = useMemo(
    () => getRealEstateTrend(snapshots).map((d) => ({ ...d, total: convert(d.total) })),
    [snapshots, convert]
  );
  const fundBankData = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getFundBankBreakdown(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const targetActual = useMemo(
    () => (currentSnapshot ? getTargetVsActual(currentSnapshot) : []),
    [currentSnapshot]
  );
  const yoy = useMemo(
    () => (currentMonth ? getYoYCompare(snapshots, currentMonth) : null),
    [snapshots, currentMonth]
  );
  const scorecard = useMemo(
    () => (currentMonth ? getSummaryScorecard(snapshots, currentMonth) : null),
    [snapshots, currentMonth]
  );
  const reLedger = useMemo(
    () => (currentMonth ? getRealEstateLedger(snapshots, currentMonth) : []),
    [snapshots, currentMonth]
  );
  const debtReport = useMemo(
    () => (currentSnapshot ? getDebtLoanReport(currentSnapshot) : null),
    [currentSnapshot]
  );
  const incomeCapital = useMemo(
    () => (currentSnapshot ? toDisplaySlices(getIncomeVsCapital(currentSnapshot), convert) : []),
    [currentSnapshot, convert]
  );
  const heatmap = useMemo(() => getAccountHeatmapData(snapshots, 12), [snapshots]);

  const exportMonthlyReport = async () => {
    if (!monthlyReportRef.current) return;
    const canvas = await html2canvas(monthlyReportRef.current, {
      backgroundColor: theme === "dark" ? "#050308" : "#f8fafc",
      scale: 2,
    });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `monthly-report-${currentMonth ?? "all"}.png`;
    a.click();
  };

  const printMonthlyReport = () => {
    window.print();
  };

  if (!currentSnapshot || !currentMonth) {
    return <div className="reports-empty">Select a month to view reports.</div>;
  }

  return (
    <div className="reports-panel">
      <div className="reports-toolbar">
        <h2>Reports — {currentSnapshot.label}</h2>
        <div className="reports-toolbar-actions">
          <button type="button" className="btn-export" onClick={exportMonthlyReport}>
            Download report PNG
          </button>
          <button type="button" className="btn-export" onClick={printMonthlyReport}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="monthly-report-wrap" ref={monthlyReportRef}>
        {/* 11. Summary scorecard */}
        {scorecard && (
          <div className="report-card report-card-wide scorecard-grid">
            <h3>Summary Scorecard</h3>
            <div className="scorecard-items">
              <div className="scorecard-item">
                <span className="scorecard-label">Net worth</span>
                <span className="scorecard-value">{formatValue(scorecard.totalValue)}</span>
              </div>
              <div className="scorecard-item">
                <span className="scorecard-label">MoM change</span>
                <span className={scorecard.momPct >= 0 ? "positive" : "negative"}>
                  {scorecard.momPct >= 0 ? "↑" : "↓"} {Math.abs(scorecard.momPct).toFixed(1)}%
                </span>
              </div>
              <div className="scorecard-item">
                <span className="scorecard-label">YoY change</span>
                <span className={scorecard.yoyPct == null ? "muted" : scorecard.yoyPct >= 0 ? "positive" : "negative"}>
                  {scorecard.yoyPct == null ? "N/A" : `${scorecard.yoyPct >= 0 ? "↑" : "↓"} ${Math.abs(scorecard.yoyPct).toFixed(1)}%`}
                </span>
              </div>
              <div className="scorecard-item">
                <span className="scorecard-label">Asset classes</span>
                <span className="scorecard-value">{scorecard.assetClassCount}</span>
              </div>
              {scorecard.topGainer && (
                <div className="scorecard-item">
                  <span className="scorecard-label">Top gainer</span>
                  <span className="positive">{scorecard.topGainer.account} (+{formatValueShort(scorecard.topGainer.change)})</span>
                </div>
              )}
              {scorecard.topLoser && (
                <div className="scorecard-item">
                  <span className="scorecard-label">Top loser</span>
                  <span className="negative">{scorecard.topLoser.account} ({formatValueShort(scorecard.topLoser.change)})</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="reports-grid">
          {/* 1 */}
          <div className="report-card">
            <h3>1. Liquid vs Illiquid</h3>
            <ReportPie data={liquidData} formatValue={formatValue} />
          </div>
          {/* 2 */}
          <div className="report-card">
            <h3>2. Real Estate Breakdown</h3>
            <ReportPie data={rePieData} formatValue={formatValue} />
          </div>
          {/* 3 */}
          <div className="report-card">
            <h3>3. Geographic Split</h3>
            <ReportPie data={geoData} formatValue={formatValue} />
          </div>
          {/* 4 */}
          <div className="report-card">
            <h3>4. Assets vs Liabilities</h3>
            <ReportPie data={assetsLiabData} innerRadius={45} formatValue={formatValue} />
          </div>
          {/* 14 */}
          <div className="report-card">
            <h3>14. Income vs Capital</h3>
            <ReportPie data={incomeCapital} formatValue={formatValue} />
          </div>
          {/* 8 */}
          <div className="report-card">
            <h3>8. Cash &amp; Funds Breakdown</h3>
            <ReportPie data={fundBankData} formatValue={formatValue} />
          </div>
        </div>

        {/* 5. MoM waterfall */}
        <div className="report-card report-card-wide">
          <h3>5. MoM Change by Asset Class</h3>
          {waterfallData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={waterfallData} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={60} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatValueShort(v)} />
                <Tooltip formatter={(v: unknown) => formatValue(Number(v ?? 0))} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry) => (
                    <Cell key={entry.name} fill={entry.value >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No month-over-month data</div>
          )}
        </div>

        {/* 7. RE trend */}
        <div className="report-card report-card-wide">
          <h3>7. Real Estate Trend</h3>
          {reTrend.some((d) => d.total !== 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={reTrend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => formatValueShort(v)} />
                <Tooltip formatter={(v: unknown) => formatValue(Number(v ?? 0))} contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="total" stroke="#059669" fill="#059669" fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No real estate data</div>
          )}
        </div>

        {/* 9. Target vs actual */}
        <div className="report-card report-card-wide">
          <h3>9. Target vs Actual Allocation</h3>
          <p className="muted report-note">Default targets — edit targets in Google Sheet with a &quot;Target %&quot; column to customize.</p>
          {targetActual.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={targetActual.slice(0, 10)} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={55} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0).toFixed(1)}%`, String(name ?? "")]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar dataKey="actualPct" name="Actual %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="targetPct" name="Target %" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Actual</th>
                    <th>Target</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {targetActual.slice(0, 8).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.actualPct.toFixed(1)}%</td>
                      <td>{r.targetPct.toFixed(1)}%</td>
                      <td className={r.variancePct >= 0 ? "positive" : "negative"}>
                        {r.variancePct >= 0 ? "+" : ""}{r.variancePct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty-chart">No allocation data</div>
          )}
        </div>

        {/* 10. YoY */}
        {yoy && (
          <div className="report-card report-card-wide">
            <h3>10. Year-over-Year — {yoy.currentLabel} vs {yoy.priorLabel}</h3>
            <div className="compare-stats">
              <div>
                <span className="compare-label">Total</span>
                <span>{formatValue(yoy.currentTotal)}</span>
                <span className="muted">vs {formatValue(yoy.priorTotal)}</span>
              </div>
              <div>
                <span className="compare-label">Change</span>
                <span className={yoy.change >= 0 ? "positive" : "negative"}>
                  {formatValue(yoy.change)} ({yoy.changePct >= 0 ? "+" : ""}{yoy.changePct.toFixed(1)}%)
                </span>
              </div>
            </div>
            <ul className="movers-list">
              {yoy.byClass.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <span className={c.change >= 0 ? "positive" : "negative"}>
                    {c.change >= 0 ? "+" : ""}{formatValueShort(c.change)} ({c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(1)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 6. Concentration */}
        {concentration && (
          <div className="report-card report-card-wide">
            <h3>6. Concentration Report</h3>
            <div className="concentration-cols">
              <div>
                <h4>Top 5 accounts</h4>
                <table className="report-table">
                  <thead><tr><th>Account</th><th>% of NW</th></tr></thead>
                  <tbody>
                    {concentration.topAccounts.map((a) => (
                      <tr key={a.account}>
                        <td>{a.account}</td>
                        <td>{a.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4>Top 3 asset classes</h4>
                <table className="report-table">
                  <thead><tr><th>Class</th><th>% of NW</th></tr></thead>
                  <tbody>
                    {concentration.topClasses.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {concentration.warnings.length > 0 && (
              <div className="warning-banner">
                {concentration.warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 12. RE ledger */}
        {reLedger.length > 0 && (
          <div className="report-card report-card-wide">
            <h3>12. Real Estate Ledger</h3>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Value</th>
                    <th>% of RE</th>
                    <th>% of Total</th>
                    <th>MoM</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {reLedger.map((r) => (
                    <tr key={r.account}>
                      <td>{r.account}</td>
                      <td>{formatValueShort(r.amount)}</td>
                      <td>{r.pctOfRe.toFixed(1)}%</td>
                      <td>{r.pctOfTotal.toFixed(1)}%</td>
                      <td className={r.momChange >= 0 ? "positive" : "negative"}>
                        {r.momChangePct >= 0 ? "↑" : "↓"} {Math.abs(r.momChangePct).toFixed(1)}%
                      </td>
                      <td className="sparkline-cell">
                        <ResponsiveContainer width={80} height={24}>
                          <LineChart data={r.sparkline.map((v, i) => ({ i, v: convert(v) }))}>
                            <Line type="monotone" dataKey="v" stroke="#059669" strokeWidth={1.5} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 13. Debt & loan */}
        {debtReport && debtReport.rows.length > 0 && (
          <div className="report-card report-card-wide">
            <h3>13. Debt &amp; Loan Report</h3>
            <p className="muted">
              Total debt: {formatValue(debtReport.totalDebt)} ({debtReport.pctOfNetWorth.toFixed(1)}% of net worth)
            </p>
            <table className="report-table">
              <thead>
                <tr><th>Account</th><th>Class</th><th>Amount</th><th>% of NW</th></tr>
              </thead>
              <tbody>
                {debtReport.rows.map((r) => (
                  <tr key={`${r.account}-${r.assetClass}`}>
                    <td>{r.account}</td>
                    <td>{r.assetClass}</td>
                    <td className="negative">{formatValue(r.amount)}</td>
                    <td>{r.pctOfNetWorth.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Heatmap bonus */}
        {heatmap.length > 0 && (
          <div className="report-card report-card-wide">
            <h3>Account Heatmap</h3>
            <p className="muted report-note">Top accounts by peak month value. Chase stock accounts always included.</p>
            <div className="heatmap-wrap">
              <table className="heatmap-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    {heatmap[0]?.values.map((v) => (
                      <th key={v.month}>{v.month.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => {
                    const vals = row.values.map((v) => convert(v.value));
                    const max = Math.max(...vals.map(Math.abs), 1);
                    return (
                      <tr key={row.account}>
                        <td className="heatmap-account" title={row.account}>
                          {row.account.length > 18 ? row.account.slice(0, 16) + "…" : row.account}
                        </td>
                        {row.values.map((v, i) => {
                          const val = vals[i];
                          const intensity = Math.min(1, Math.abs(val) / max);
                          const bg = val >= 0
                            ? `rgba(34, 197, 94, ${0.15 + intensity * 0.55})`
                            : `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`;
                          return (
                            <td key={v.month} className="heatmap-cell" style={{ background: bg }} title={formatValue(v.value)}>
                              {Math.abs(val) > 0 ? formatValueShort(val) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
