# Forex Signal Assistant — GitHub-ready

This repo contains a static frontend and a Netlify serverless function to fetch live FX prices
(Alpha Vantage) and basic fundamental indicators (TradingEconomics). The frontend computes
lightweight indicators locally and produces simple Day / Swing confluence signals.

## Quick deploy (Netlify)

1. Create a new GitHub repo and push this project into it.
2. Sign in to Netlify and choose **New site from Git** → select your repo.
3. In Netlify site settings, set these environment variables:
   - `ALPHAVANTAGE_KEY` = your Alpha Vantage API key
   - `TE_KEY` = your TradingEconomics API key (optional; `guest:guest` can work but is limited)
4. Deploy. The site will be served from the `public/` folder and the functions from `netlify/functions`.

## Local development (optional)

Install Netlify CLI and dependencies:

```bash
npm install
npm i -g netlify-cli
netlify dev
```

Set env vars locally (e.g., `.env`):

```
ALPHAVANTAGE_KEY=your_key_here
TE_KEY=guest:guest
```

## Files

- `public/index.html` — frontend UI
- `src/app.js` — frontend logic
- `netlify/functions/proxy.js` — serverless proxy to Alpha Vantage & TradingEconomics
- `netlify.toml`, `package.json` — config & deps

## Notes & next steps

- Alpha Vantage has strict free-tier rate limits. Consider caching or an upgraded feed.
- Improve confluence rules, add charts, save user settings, or extend fundamentals scoring.
- This tool is educational only — not financial advice.
