# Google Sheets API Setup

Connect your Asset Dashboard to a Google Sheet for live data.

## 1. Create an API key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. **Enable the API:** APIs & Services → Library → search "Google Sheets API" → Enable
4. **Create credentials:** APIs & Services → Credentials → Create credentials → API key
5. Copy the API key (you can restrict it later for security)

## 2. Share your sheet

1. Open your Google Sheet
2. Click **Share**
3. Under "General access", set to **Anyone with the link** (Viewer)
4. This allows the API to read the sheet with your key

## 3. Configure the dashboard

1. In the dashboard header, click the **⚙** (gear) button
2. Enter:
   - **Spreadsheet ID:** From the URL `docs.google.com/spreadsheets/d/`**`ID_HERE`**`/edit`
   - **Sheet name:** The tab name (e.g. `Tidy_Data_Dashboard`)
   - **API key:** Your Google API key
3. Click **Save & reload**

## Your sheet

- **Spreadsheet ID:** `1HQ-ZJsis1fHrFSeM9DCTPtl9KHwhX6uwxrztW2-lmsA`
- **Sheet name:** `Tidy_Data_Dashboard`

## Data format

See [GOOGLE_SHEET_FORMAT.md](./GOOGLE_SHEET_FORMAT.md) for the required column layout.

## Security note

The API key is stored in your browser's localStorage. For a personal dashboard this is usually fine. To restrict the key:

- APIs & Services → Credentials → your API key → Edit
- Restrict to "Google Sheets API"
- Optionally restrict to your domain (for web apps)
