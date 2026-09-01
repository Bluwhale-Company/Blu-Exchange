import {escapeHTML as esc, money} from './core.mjs';

export function candleWindow(quote,range,now=Date.now()) {
 const candles=quote.candles || [];
 if(quote.status==='sample')return range==='1d'?candles.slice(-24):candles;
 const cutoff=now/1000-(range==='1d'?24:168)*3600;
 return candles.filter(c=>c.time>=cutoff&&c.time<=now/1000);
}

export function renderCandles(container,asset,range,onHover) {
 const candles=candleWindow(asset.quote,range);
 if(candles.length<2)return false;
 const width=Math.max(360,container.clientWidth), height=560;
 const right=width-82, bottom=530, top=54, priceBottom=440;
 const min=Math.min(...candles.map(c=>c.low)),max=Math.max(...candles.map(c=>c.high));
 const pad=Math.max(max-min,max*.002)*.12,lo=min-pad,hi=max+pad;
 const y=v=>top+(hi-v)/(hi-lo)*(priceBottom-top);
 const first=candles[0].time,last=candles.at(-1).time;
 const x=(c,i)=>12+(last>first?(c.time-first)/(last-first):i/(candles.length-1))*(right-48);
 const spacing=last>first?Math.min(...candles.slice(1).map((c,i)=>x(c,i+1)-x(candles[i],i))):(right-48)/(candles.length-1);
 const body=Math.max(1,Math.min(11,spacing*.72));
 const volumeMax=Math.max(1,...candles.map(c=>c.volume));
 const number=v=>money(v).replace('$','');
 const time=(c,i)=>c.time?new Date(c.time*1000).toLocaleString([],range==='1d'?{hour:'2-digit',minute:'2-digit'}:{month:'short',day:'numeric'}):'Sample '+(i+1);
 const color=c=>c.close>=c.open?'#00b69b':'#f23645';
 let grid='';
 for(let i=0;i<8;i++){
  const py=top+i*(bottom-top)/8;
  grid+=`<line x1="0" x2="${right}" y1="${py}" y2="${py}" class="candle-grid"/><text x="${right+8}" y="${py+4}" class="candle-axis">${number(hi-(py-top)/(priceBottom-top)*(hi-lo))}</text>`;
 }
 for(let i=0;i<6;i++){
  const index=Math.round(i*(candles.length-1)/5),px=x(candles[index],index);
  grid+=`<line x1="${px}" x2="${px}" y1="${top}" y2="${bottom}" class="candle-grid"/><text x="${px}" y="550" text-anchor="${i===0?'start':'middle'}" class="candle-axis">${esc(time(candles[index],index))}</text>`;
 }
 const bars=candles.map((c,i)=>{
  const px=x(c,i),tint=color(c),v=c.volume/volumeMax*110;
  return `<g fill="${tint}" stroke="${tint}"><line x1="${px}" x2="${px}" y1="${y(c.high)}" y2="${y(c.low)}"/><rect x="${px-body/2}" y="${Math.min(y(c.open),y(c.close))}" width="${body}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" stroke="none"/><rect x="${px-body/2}" y="${bottom-v}" width="${body}" height="${v}" opacity=".35" stroke="none"/></g>`;
 }).join('');
 const latest=candles.at(-1),py=y(latest.close),tint=color(latest);
 container.innerHTML=`<div class="candle-heading"><strong>${esc(asset.name)} / USD · 1h · ${esc(asset.quote.source)}</strong><span id="candle-ohlc"></span></div><div class="candle-volume">Vol · ${esc(asset.symbol)} <span id="candle-volume-value"></span>${asset.quote.status==='sample'?' · Illustrative':''}</div><svg id="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(asset.name)} hourly candlestick chart with volume"><line x1="${right}" x2="${right}" y1="0" y2="${height}" class="candle-border"/>${grid}${bars}<line x1="0" x2="${right}" y1="${py}" y2="${py}" stroke="${tint}" stroke-dasharray="2 2"/><rect x="${right}" y="${py-9}" width="82" height="18" fill="${tint}"/><text x="${right+5}" y="${py+4}" fill="white" font-size="11">${number(latest.close)}</text><g id="crosshair" visibility="hidden" stroke="#8b939f" stroke-dasharray="4 4"><line id="crosshair-x" y1="${top}" y2="${bottom}"/><line id="crosshair-y" x1="0" x2="${right}"/></g><line x1="0" x2="${width}" y1="${bottom}" y2="${bottom}" class="candle-border"/></svg>`;
 const detail=c=>{
  container.querySelector('#candle-ohlc').textContent=`O ${number(c.open)}  H ${number(c.high)}  L ${number(c.low)}  C ${number(c.close)}`;
  container.querySelector('#candle-ohlc').style.color=color(c);
  container.querySelector('#candle-volume-value').textContent=c.volume.toLocaleString('en-US',{maximumFractionDigits:2});
 };
 detail(latest);
 const svg=container.querySelector('svg');
 svg.addEventListener('pointermove',event=>{
  const box=svg.getBoundingClientRect(),px=(event.clientX-box.left)/box.width*width;
  const index=candles.reduce((best,c,i)=>Math.abs(x(c,i)-px)<Math.abs(x(candles[best],best)-px)?i:best,0),c=candles[index];
  const vertical=container.querySelector('#crosshair-x'),horizontal=container.querySelector('#crosshair-y');
  vertical.setAttribute('x1',x(c,index));vertical.setAttribute('x2',x(c,index));
  horizontal.setAttribute('y1',y(c.close));horizontal.setAttribute('y2',y(c.close));
  container.querySelector('#crosshair').setAttribute('visibility','visible');detail(c);onHover(time(c,index)+' · '+money(c.close));
 });
 svg.addEventListener('pointerleave',()=>{container.querySelector('#crosshair').setAttribute('visibility','hidden');detail(latest);onHover('');});
 return true;
}
