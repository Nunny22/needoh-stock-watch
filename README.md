# NeeDoh Stock Watch

Private stock monitor for the genuine 2026 Schylling NeeDoh Advent Calendar.

- Checks configured UK retailer pages every 5 minutes via GitHub Actions.
- Uses a lightweight HTTP check first. Playwright/Chromium is available for retailers that require rendered pages.
- Writes the latest results to `docs/status.json` and a simple dashboard at `docs/index.html`.
- Does **not** bypass CAPTCHAs, queues, retailer purchase limits, or anti-bot controls.
- Does **not** auto-purchase. Alerts are intended to take you to the legitimate retailer checkout.

Initial monitored pages: Smyths search results, MenKind product page, Tinker & Tot product page.

## Alert setup

Add repository secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to enable instant Telegram alerts. Without them, monitoring still runs and records status.

## Manual run

Actions → NeeDoh Stock Watch → Run workflow.
