# FinTrack — Personal Finance Tracker

A clean, finance tracker that runs entirely in your browser. No server, no account, no tracking: your data stays on your device.


## Features

- **Income and expenses** — add, edit, delete (with Undo), and categorise transactions
- **Live summary** — total income, total spent, net balance, and savings rate
- **Monthly budgets** — per-category limits with progress bars, percentage used, and amount left or over
- **Insights** — daily average, projected month-end spend, biggest category with month-over-month change, top expenses
- **Charts** — bar, doughnut, and a 6-month income vs expense trend
- **Search, filter, sort** — by text, type, date range (all time, this month, last month, custom), and amount
- **Backup and restore** — JSON backup and restore, CSV export
- **Demo data** — one click to fill the app with sample transactions
- **Light and dark themes** — follows your system setting, with a manual toggle
- **Works offline** — Chart.js is bundled locally, with no CDN needed

## Tech stack

| Layer | Choice |
|---|---|
| UI | HTML, CSS (system font stack, CSS variables for theming) |
| Logic | Vanilla JavaScript (no framework, no build step) |
| Charts | [Chart.js](https://www.chartjs.org/) 4.4.1 (bundled in `vendor/`) |
| Storage | Browser `localStorage` |

## Getting started

No installation is needed.

```bash
git clone <your-repo-url>
cd <your-repo-folder>/fintrack
```

Then open `index.html` in any modern browser (double-click it, or serve the folder):

```bash
# optional: run a tiny local server
python3 -m http.server 8000
# open http://localhost:8000
```

## Project structure

```
fintrack/
├── index.html          # page structure
├── style.css           # design system, light and dark themes
├── app.js              # state, calculations, rendering, import/export
└── vendor/
    └── chart.umd.js    # Chart.js 4.4.1 (local copy)

```

## How it works

- **Money is stored as integer paise** (₹1 = 100), never as floats, so totals stay exact (for example 0.10 + 0.20 = 0.30).
- **One state object, one render loop.** Every change goes through `setState()`, which saves and then re-renders the whole UI.
- **Pure calculation functions** (`totals`, `byCat`, `sum`) take data in and return values, with no DOM access.
- **Safe rendering.** User text is escaped before it touches the page, and imported data is validated and normalised (categories, ids, dates, amounts) before use.
- **Atomic restore.** A backup is fully validated first, and if applying it fails, your previous data is rolled back.

## Your data and privacy

- Everything is saved in your browser's `localStorage` on your device only.
- Nothing is uploaded anywhere, and the app makes no network requests.
- Clearing your browser data erases your transactions, so use **Backup JSON** regularly.
- Restoring a backup **replaces** your current data. The app asks for confirmation and tells you how many invalid rows were skipped.
- The data is not encrypted. Don't use it on a shared computer for sensitive records.

## Known limitations

- The transaction list renders all rows without paging, so very large datasets (10,000+ rows) may be slow.
- `localStorage` has a size limit (about 5 MB in most browsers). If saving fails, the app says so and asks you to export a backup.
- Future-dated transactions count towards "this month" and the projection.
- The 6-month trend chart always shows all data and ignores the date filter.

## Authors

- **Shiv Ahir** 

## 
