// netlify/functions/proxy.js
// Node 18+ handler. Fetches Alpha Vantage FX and TradingEconomics basic indicators.
// Expects env vars: ALPHAVANTAGE_KEY, TE_KEY (TradingEconomics API).
// Query params: pair (e.g., EURUSD), mode ("Day"|"Swing"), outputsize ("compact"|"full")

import fetch from 'node-fetch';

const AV_BASE = 'https://www.alphavantage.co/query';
const TE_BASE = 'https://api.tradingeconomics.com';

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const pair = (params.pair || 'EURUSD').toUpperCase();
    const mode = (params.mode || 'Day');
    const outputsize = params.outputsize || 'compact';
    const avkey = process.env.ALPHAVANTAGE_KEY;
    const tekey = process.env.TE_KEY || 'guest:guest';

    if(!avkey) return { statusCode: 400, body: JSON.stringify({ error: 'Missing ALPHAVANTAGE_KEY env var' }) };

    const base = pair.slice(0,3), quote = pair.slice(3);

    // Alpha Vantage endpoints
    const avFn = mode === 'Day' ? 'FX_INTRADAY' : 'FX_DAILY';
    const interval = mode === 'Day' ? '30min' : null;
    let avUrl = `${AV_BASE}?function=${avFn}&from_symbol=${base}&to_symbol=${quote}&apikey=${encodeURIComponent(avkey)}&outputsize=${outputsize}`;
    if(interval) avUrl += `&interval=${interval}`;

    const avResp = await fetch(avUrl);
    if(!avResp.ok) throw new Error('Alpha Vantage error: ' + avResp.status);
    const avJson = await avResp.json();

    // Extract time series key dynamically (Alpha Vantage has different keys)
    const tsKey = Object.keys(avJson).find(k => /Time Series|Time Series FX/i.test(k));
    if(!tsKey) throw new Error('Alpha Vantage returned no time series (maybe rate limited)');

    // Convert series to an ordered array
    const series = avJson[tsKey];
    const rows = Object.entries(series).map(([t, d]) => ({
      t,
      open: parseFloat(d['1. open']),
      high: parseFloat(d['2. high']),
      low: parseFloat(d['3. low']),
      close: parseFloat(d['4. close'])
    })).sort((a,b) => new Date(a.t) - new Date(b.t));

    // TradingEconomics: basic indicators for base & quote
    const countryMap = {
      USD: 'united states', EUR: 'euro area', GBP: 'united kingdom', JPY: 'japan',
      CHF: 'switzerland', CAD: 'canada', AUD: 'australia', NZD: 'new zealand'
    };
    async function teBasic(ccy) {
      const country = countryMap[ccy];
      if(!country) return null;
      // fetch recent Interest Rate, Inflation YoY, Unemployment
      const indicators = ['Interest Rate','Inflation Rate YoY','Unemployment Rate'];
      const out = {};
      for(const ind of indicators) {
        const url = `${TE_BASE}/historical/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(ind)}?c=${encodeURIComponent(tekey)}&format=json`;
        try{
          const r = await fetch(url);
          if(!r.ok) continue;
          const j = await r.json();
          if(Array.isArray(j) && j.length){
            const last = j[j.length - 1];
            const key = ind.includes('Interest') ? 'rate' : ind.includes('Inflation') ? 'cpiYoY' : 'unemp';
            out[key] = Number(last.Value);
          }
        }catch(e){ /* ignore per-country errors */ }
      }
      return out;
    }

    const [baseFund, quoteFund] = await Promise.all([teBasic(base), teBasic(quote)]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        pair,
        mode,
        rows,
        fundamentals: { [base]: baseFund, [quote]: quoteFund },
        rawAv: avJson
      }),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'server error' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};
