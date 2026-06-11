# Google Sheet Format for Asset Dashboard

Use this format so the dashboard can connect via the Google Sheets API.

## Option A: Date column

**Row 1 – Headers:**

| A | B | C | D | E |
|---|---|---|---|---|
| Date | Account | Amount (Rs) | Amount (Millions) | Asset Class |

- **Date:** MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD

## Option B: Separate Month and Year columns

**Row 1 – Headers:**

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Month | Year | Account | Amount (Rs) | Amount (Millions) | Asset Class |

- **Month:** 1–12 or Jan/Feb/Mar/...
- **Year:** 2024

## Column details

| Column | Required | Format | Example |
|--------|----------|--------|---------|
| **Date** (Option A) | Yes* | MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD | 09/02/2024 |
| **Month** (Option B) | Yes* | 1–12 or Jan, Feb, ... | 9 or Sep |
| **Year** (Option B) | Yes* | 4-digit year | 2024 |
| **Account** | Yes | Text | BAHL Account |
| **Amount (Rs)** | Yes | Number (no commas) | 20182671 |
| **Amount (Millions)** | No | Number | 20.18 |
| **Asset Class** | Yes | Text | Cash |

*Use either Date (Option A) or Month + Year (Option B).

## Example rows (Option A)

```
Date        | Account           | Amount (Rs) | Amount (Millions) | Asset Class
09/02/2024  | BAHL Account      | 20182671    | 20.18             | Cash
09/02/2024  | Chase Securities  | 20000000    | 20                | Fixed Income
```

## Example rows (Option B)

```
Month | Year | Account           | Amount (Rs) | Amount (Millions) | Asset Class
9     | 2024 | BAHL Account      | 20182671    | 20.18             | Cash
9     | 2024 | Chase Securities  | 20000000    | 20                | Fixed Income
10    | 2024 | BAHL Account      | 1152191     | 1.15              | Cash
```

## Setup steps

1. Create a new Google Sheet or open an existing one.
2. Put the header row in row 1 exactly as above.
3. Add your data starting from row 2.
4. Share the sheet: **File → Share → General access → Anyone with the link** (Viewer).
5. Copy the Sheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/`**`SHEET_ID_HERE`**`/edit`
6. Use this Sheet ID when configuring the dashboard API connection.

## Publish as CSV (alternative)

If you prefer not to use the API:

1. **File → Share → Publish to web**
2. Choose the sheet and **Comma-separated values (.csv)**
3. Copy the published URL and use it as the data source.
