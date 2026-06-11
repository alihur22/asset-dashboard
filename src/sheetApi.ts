/**
 * Fetch data from Google Sheets API and convert to CSV format.
 * Requires: Google Cloud project with Sheets API enabled, API key.
 */

export interface SheetConfig {
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? "").trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Convert Sheets API response to CSV string */
function rowsToCsv(values: unknown[][]): string {
  if (!values?.length) return "";
  return values
    .map((row) => (Array.isArray(row) ? row.map(escapeCsvCell).join(",") : ""))
    .join("\n");
}

/** Fetch sheet data via Google Sheets API v4 */
export async function fetchSheetAsCsv(config: SheetConfig): Promise<string> {
  const { spreadsheetId, sheetName, apiKey } = config;
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { values?: unknown[][] };
  const values = data.values;
  if (!values?.length) return "";

  return rowsToCsv(values);
}
