// src/app.js
async function $(id){return document.getElementById(id)}
function parseCSV(txt){
  const lines=(txt||'').trim().split(/\r?\n/).filter(Boolean);
  const out=[];
  for(let i=0;i<lines.length;i++){
    const row = lines[i].split(',').map(s=>s.trim());
    if(i===0 && isNaN(parseFloat(row[1]))) continue;
    if(row.length<5) continue;
    out.push({t:row[0], o:parseFloat(row[1]), h:parseFloat(row[2]), l:parseFloat(row[3]), c:parseFloat(row[4])});
  }
  return out;
}
function SMA(arr,n){const o=[];let s=0;for(let i=0;i<arr.length;i++){s+=arr[i];if(i>=n)s-=arr[i-n];o.push(i>=n-1?s/n:null)}return o}
function EMA(arr,n){const o=[];const k=2/(n+1);let ema=null;for(let i=0;i<arr.length;i++){const v=arr[i];if(ema===null){if(i>=n-1){let s=0;for(let j=i-n+1;j<=i;j++) s+=arr[j];ema=s/n}o.push(ema);continue}ema=v*k+ema*(1-k);o.push(ema)}return o}
function RSI(cl,n=14){const res=new Array(cl.length).fill(null);let ag=0,al=0;for(let i=1;i<cl.length;i++){const ch=cl[i]-cl[i-1];const g=Math.max(ch,0), l=Math.max(-ch,0);if(i<=n){ag+=g;al+=l;if(i===n){ag/=n;al/=n;const rs=al===0?100:ag/al;res[i]=100-(100/(1+rs))}}else{ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n;const rs=al===0?100:ag/al;res[i]=100-(100/(1+rs))}}return res}
function TR(pc,h,l){return Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))}
function ATR(h,l,c,n=14){const out=new Array(c.length).fill(null);let pc=c[0];let trv=[];for(let i=1;i<c.length;i++){const tr=TR(pc,h[i],l[i]);trv.push(tr);pc=c[i];if(i===n){out[i]=trv.slice(0,n).reduce((a,b)=>a+b,0)/n}else if(i>n){out[i]=(out[i-1]*(n-1)+tr)/n}}return out}
function inferPipFactor(pair, price){ return /JPY$/.test(pair) ? 100 : 10000; }
function priceFromPips(pips, pair, price){ const f = inferPipFactor(pair, price); return pips / f; }
function pipsFromPrice(delta, pair, price){ const f = inferPipFactor(pair, price); return delta * f; }
async function callProxy(pair, mode){
  const q = new URLSearchParams({ pair, mode, outputsize: 'compact' });
  const res = await fetch('/.netlify/functions/proxy?' + q.toString());
  if(!res.ok) throw new Error('Proxy fetch failed');
  return await res.json();
}
async function computeAndRender(mode){
  const pair = (await $('pair')).value;
  const csvText = (await $('csvArea')).value;
  let rows = parseCSV(csvText);
  const fundText = (await $('fundArea')).value;
  let funds = {};
  try{ if(fundText.trim()) funds = JSON.parse(fundText); }catch(e){ funds = {}; }
  if(!rows.length){
    try{
      const proxy = await callProxy(pair, mode);
      rows = proxy.rows.map(r => ({ t: r.t, o: r.open, h: r.high, l: r.low, c: r.close }));
      if(proxy.fundamentals) { Object.assign(funds, proxy.fundamentals); (await $('fundArea')).value = JSON.stringify(funds, null, 2); }
    }catch(err){
      (await $('snapshot')).textContent = 'Live fetch failed: ' + err.message;
      return;
    }
  }
  if(rows.length < 60){
    (await $('snapshot')).textContent = 'Need ~60 candles; either paste CSV or use Fetch Live.';
    return;
  }
  const closes = rows.map(r=>r.c), highs = rows.map(r=>r.h), lows = rows.map(r=>r.l);
  const sma20 = SMA(closes,20), sma50 = SMA(closes,50);
  const ema8 = EMA(closes,8), ema21 = EMA(closes,21);
  const rsi = RSI(closes,14);
  const atr = ATR(highs,lows,closes,14);
  const L = closes.length - 1;
  const price = closes[L];
  const pipFactor = inferPipFactor(pair, price);
  const atrPips = atr[L] ? atr[L] * pipFactor : null;
  const trendUp = sma20[L] && sma50[L] && sma20[L] > sma50[L];
  const trendDn = sma20[L] && sma50[L] && sma20[L] < sma50[L];
  const emaBull = ema8[L] && ema21[L] && ema8[L] > ema21[L];
  const emaBear = ema8[L] && ema21[L] && ema8[L] < ema21[L];
  function scoreFund(f){
    let s = 50;
    if(!f) return s;
    if(typeof f.rate === 'number') s += f.rate * 1;
    if(typeof f.cpiYoY === 'number') s += (f.cpiYoY - 2) * 2;
    if(typeof f.unemp === 'number') s += (4.5 - f.unemp) * 1.5;
    return Math.max(0, Math.min(100, s));
  }
  const [base, quote] = [pair.slice(0,3), pair.slice(3)];
  const sBase = scoreFund(funds[base]), sQuote = scoreFund(funds[quote]);
  const fDelta = sBase - sQuote;
  let sideTech = 'WAIT';
  if(trendUp && emaBull) sideTech = 'BUY';
  else if(trendDn && emaBear) sideTech = 'SELL';
  let side = 'WAIT';
  if(sideTech === 'BUY' && fDelta > 5) side = 'BUY';
  else if(sideTech === 'SELL' && fDelta < -5) side = 'SELL';
  const rr = 1.8, spread = 0.8, buf = 0.3, pipVal = 10, acct = 2000, riskPct = 1;
  const stopPipsBase = atrPips ? atrPips * 1.2 : 15;
  const stopPips = stopPipsBase + spread + buf;
  const stopPrice = side === 'BUY' ? price - priceFromPips(stopPips, pair, price) : price + priceFromPips(stopPips, pair, price);
  const tp1 = side === 'BUY' ? price + priceFromPips(stopPips * rr, pair, price) : price - priceFromPips(stopPips * rr, pair, price);
  const tp2 = side === 'BUY' ? price + priceFromPips(stopPips * (rr + 0.5), pair, price) : price - priceFromPips(stopPips * (rr + 0.5), pair, price);
  const riskAmt = acct * (riskPct / 100);
  const lots = riskAmt / (stopPips * pipVal);
  const snapshot = [
    `Price: ${price.toFixed(5)}`,
    `ATR(14) pips: ${atrPips ? atrPips.toFixed(1) : '—'}`,
    `Trend: ${trendUp ? 'Up' : trendDn ? 'Down' : 'Sideways'}`,
    `EMA: ${emaBull ? 'Bullish' : emaBear ? 'Bearish' : 'Neutral'}`,
    `Fund Δ (${base}-${quote}): ${fDelta.toFixed(1)}`
  ].join('\n');
  $('snapshot').textContent = snapshot;
  if(side === 'WAIT'){
    $('signal').textContent = `WAIT — Technicals and fundamentals not aligned sufficiently (tech: ${sideTech}, fund Δ: ${fDelta.toFixed(1)})`;
  } else {
    $('signal').innerHTML = [
      `Signal: ${side}`,
      `Entry: ${price.toFixed(5)}`,
      `Stop: ${stopPrice.toFixed(5)} (~${stopPips.toFixed(1)} pips)`,
      `TP1: ${tp1.toFixed(5)} | TP2: ${tp2.toFixed(5)}`,
      `Size estimate: ${lots.toFixed(2)} lots (risk ≈ ${riskAmt.toFixed(2)})`,
      `Reason: Tech (${sideTech}) + Fundamentals (${fDelta.toFixed(1)} Δ)`
    ].join('<br>');
  }
}
(async function init(){
  const pairSelect = await $('pair'), btnFetch = await $('fetchLive'), btnGen = await $('generate'), btnSample = await $('loadSample');
  let mode = 'Day';
  document.getElementById('btnDay').addEventListener('click', ()=> { mode='Day'; document.getElementById('btnDay').className='primary'; document.getElementById('btnSwing').className='muted'; });
  document.getElementById('btnSwing').addEventListener('click', ()=> { mode='Swing'; document.getElementById('btnSwing').className='primary'; document.getElementById('btnDay').className='muted'; });
  btnSample.addEventListener('click', ()=> {
    $('csvArea').value = `time,open,high,low,close
2025-08-13 06:00,1.1000,1.1010,1.0990,1.1008
2025-08-13 06:30,1.1008,1.1018,1.1000,1.1015
2025-08-13 07:00,1.1015,1.1026,1.1010,1.1021
2025-08-13 07:30,1.1021,1.1035,1.1015,1.1031
2025-08-13 08:00,1.1031,1.1040,1.1024,1.1036
2025-08-13 08:30,1.1036,1.1048,1.1031,1.1042`;
  });
  btnFetch.addEventListener('click', async ()=>{
    try{
      btnFetch.disabled = true;
      btnFetch.textContent = 'Fetching…';
      const pair = pairSelect.value;
      const p = new URLSearchParams({ pair, mode });
      const res = await fetch('/.netlify/functions/proxy?' + p.toString());
      if(!res.ok) throw new Error('Fetch failed');
      const j = await res.json();
      const csv = ['time,open,high,low,close', ...j.rows.slice(-300).map(r=>`${r.t},${r.open},${r.high},${r.low},${r.close}`)];
      $('csvArea').value = csv.join('\n');
      if(j.fundamentals) $('fundArea').value = JSON.stringify(j.fundamentals, null, 2);
      $('snapshot').textContent = 'Live data fetched. Click Generate Signal.';
    }catch(e){
      $('snapshot').textContent = 'Live fetch error: ' + e.message;
    }finally{
      btnFetch.disabled = false; btnFetch.textContent = 'Fetch Live (server)';
    }
  });
  btnGen.addEventListener('click', ()=> computeAndRender(mode));
})();
