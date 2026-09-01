import {renderCandles} from './candles.mjs';
import {escapeHTML as esc, money, compact, percent, selectAssets, estimate, chartGeometry, chartWindow, QUOTE_REFRESH_MS} from './core.mjs';

const main=document.querySelector('#main');
const modal=document.querySelector('#modal');
const state={assets:[],feeds:[],watchlist:new Set(),category:'all',query:'',sort:'featured',page:1,range:'7d',side:'buy',orderType:'market',quantity:'',limit:'',connected:false,updatedAt:null,refreshSeconds:30};
const pageSize=10;
const icons={
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
 star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9Z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
 moon:'<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 chart:'<path d="M4 3v17h17M7 14l4-5 4 3 6-8"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>'
};
const icon=(name,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.info)+'</svg>';
const asset=id=>state.assets.find(a=>a.id===id);
const changeClass=q=>Number.isFinite(q.change)?(q.change>=0?'positive':'negative'):'';
const mark=a=>'<span class="asset-mark '+(a.kind==='stock'?'stock ':'')+(a.mark.length>1?'small-text':'')+'" style="--asset-color:'+esc(a.color)+'" aria-hidden="true">'+esc(a.mark)+'</span>';
const identity=a=>'<span class="asset-identity">'+mark(a)+'<span><span class="asset-label">'+esc(a.symbol)+(a.id==='bluai'?'<span class="tag">BLUWHALE</span>':'')+'</span><span class="asset-subtitle">'+esc(a.name)+'</span></span></span>';
const badge=q=>'<span class="quote-badge '+esc(q.status)+'" title="'+esc(quoteDescription(q))+'"><i></i>'+esc(({live:'Live',sample:'Sample',delayed:'Delayed',stale:'Stale'})[q.status]||'Unavailable')+'</span>';
const change=(q,suffix='')=>'<span class="change '+changeClass(q)+'">'+percent(q.change)+(suffix?'<small>'+esc(suffix)+'</small>':'')+'</span>';
function quoteDescription(q){
 if(q.status==='sample') return q.note || 'Illustrative sample, not a current market price.';
 const prefix=q.source==='Coinbase'?'Fetched ':'Quote time ';
 return q.source+' · '+prefix+(q.asOf?new Date(q.asOf).toLocaleString():'unavailable')+(q.status==='stale'?' · Refresh unavailable; last known quote.':'');
}
function watchButton(a){
 return '<button class="watch-button '+(state.watchlist.has(a.id)?'selected':'')+'" data-watch="'+esc(a.id)+'" aria-pressed="'+state.watchlist.has(a.id)+'" aria-label="'+(state.watchlist.has(a.id)?'Remove ':'Add ')+esc(a.name)+(state.watchlist.has(a.id)?' from':' to')+' watchlist">'+icon('star',16)+'</button>';
}
function sparkline(q,label=false){
 const geo=chartGeometry(q.chart,110,28,2,q.chartTimes || []);
 if(!geo) return '<span class="no-chart">No history</span>';
 return '<svg class="sparkline '+(q.chart.at(-1)>=q.chart[0]?'positive':'negative')+'" viewBox="0 0 110 28" role="img" aria-label="'+esc(q.chartSource)+'"><path d="'+geo.path+'" fill="none"/></svg>'+(label?'<span class="trend-label">'+(q.status==='sample'?'Illustrative':'7-day history')+'</span>':'');
}
function currentSection(){
 const path=location.pathname;
 if(path.startsWith('/trade/'))return 'trade';
 if(path==='/watchlist')return 'watchlist';
 if(['/portfolio','/orders','/user/wallet','/user/account'].includes(path))return 'portfolio';
 return 'markets';
}
function updateHeader(){
 const section=currentSection();
 document.querySelectorAll('[data-section]').forEach(link=>{
  const active=link.dataset.section===section;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 const live=state.assets.filter(a=>a.quote.status==='live').length;
 const label=!state.connected?'Connection lost':live?live+' live quotes':state.feeds.some(f=>f.status==='connecting')?'Connecting':'Preview data';
 document.querySelector('#feed-label').textContent=label;
 document.querySelector('.status-dot').classList.toggle('connected',state.connected&&live>0);
 const light=document.documentElement.dataset.theme==='light';
 const themeButton=document.querySelector('#theme-toggle');
 themeButton.innerHTML=icon(light?'moon':'sun',17);
 themeButton.setAttribute('aria-label','Switch to '+(light?'dark':'light')+' theme');
}
function feature(){
 const a=asset('bluai');if(!a)return '';
 return '<div class="feature-top"><span class="feature-tag">IN THE SPOTLIGHT</span>'+badge(a.quote)+'</div><div class="feature-identity">'+mark(a)+'<div><strong>BluAI</strong><p>The Bluwhale ecosystem token</p></div></div><div class="feature-numbers"><strong>'+money(a.quote.price)+'</strong>'+change(a.quote)+'</div><div class="feature-curve">'+sparkline(a.quote)+'<small>'+(a.quote.status==='sample'?'Illustrative price history':esc(a.quote.chartSource))+'</small></div><div class="feature-foot"><span>BLUAI / USD</span><a href="/trade/bluai" data-nav>Explore BluAI '+icon('arrow',14)+'</a></div>';
}
function spotlights(){
 return ['bitcoin','ethereum','nvda','asml'].map(id=>{
  const a=asset(id);if(!a)return '';
  return '<a class="spotlight" href="/trade/'+a.id+'" data-nav><div class="spotlight-head">'+mark(a)+'<span>'+a.symbol+'</span>'+badge(a.quote)+'</div><div class="spotlight-price">'+money(a.quote.price)+'</div><div class="spotlight-bottom">'+change(a.quote,a.kind==='crypto'?'24h':'session')+sparkline(a.quote)+'</div></a>';
 }).join('');
}
function marketNotice(){
 const samples=state.assets.filter(a=>a.quote.status==='sample').length;
 return icon('info',13)+'<span>'+(state.connected?'':'Connection interrupted. Retained quotes are marked stale. ')+(samples?samples+' assets use labeled sample prices. ':'')+'Coinbase quotes refresh every 30 seconds. BLUAI and stocks remain sample previews. <button data-action="sources">View sources</button></span>';
}
function marketPage(){
 const watching=currentSection()==='watchlist';
 document.title=(watching?'Watchlist':'Markets')+' · Bluwhale';
 const masthead=location.pathname==='/'?'<div class="brand-masthead"><img src="/static/images/bluwhale-wordmark.svg" width="920" height="144" alt="Bluwhale"></div>':'';
 main.innerHTML='<div class="page">'+masthead+(watching?'<div class="section-intro"><span class="eyebrow">YOUR MARKET VIEW</span><h1>A little more focused.</h1><p>Follow the assets that matter to you. Your watchlist stays here until you reload the page.</p></div>':'<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><span class="eyebrow">CRYPTO &amp; EQUITIES, TOGETHER</span><h1 id="hero-title">Every market.<br><span>One clear view.</span></h1><p>From Bitcoin to the businesses shaping tomorrow.<br>Explore crypto and leading North American &amp; European stocks.</p><div class="hero-links"><a class="primary-button" href="/trade/bitcoin" data-nav>Explore the terminal '+icon('arrow',15)+'</a><button class="text-button" data-action="browse">Browse markets ↓</button></div></div><div class="feature-card" id="feature-card">'+feature()+'</div></section><section class="spotlight-grid" id="spotlights" aria-label="Featured markets">'+spotlights()+'</section>')+
 '<section aria-labelledby="markets-title" id="market-section"><div class="market-head"><div><h2 id="markets-title">'+(watching?'Your watchlist':'Market overview')+'</h2><p>'+(watching?'A closer look at your selected assets.':'Digital assets and public companies, side by side.')+'</p></div><span class="market-count">'+icon(watching?'star':'globe',14)+'<span id="market-count"></span></span></div>'+
 '<div class="market-toolbar">'+(watching?'<div class="tabs"><span class="tab active">All saved assets</span></div>':'<div class="tabs" aria-label="Market categories">'+[['all','All markets'],['crypto','Crypto'],['north-america','North America'],['europe','Europe']].map(([id,label])=>'<button class="tab '+(state.category===id?'active':'')+'" data-category="'+id+'" aria-pressed="'+(state.category===id)+'">'+label+'</button>').join('')+'</div>')+
 '<div class="toolbar-inputs"><label class="search-box">'+icon('search',14)+'<input type="search" id="market-search" value="'+esc(state.query)+'" placeholder="Search name or symbol" aria-label="Search markets"><kbd>/</kbd></label><select class="sort-select" id="market-sort" aria-label="Sort markets">'+[['featured','Featured'],['gainers','Top gainers'],['losers','Top losers'],['price-high','Highest price'],['name','Name A–Z']].map(([id,label])=>'<option value="'+id+'" '+(state.sort===id?'selected':'')+'>'+label+'</option>').join('')+'</select></div></div>'+
 '<div class="notice" id="market-notice">'+marketNotice()+'</div><div id="market-results"></div>'+
 '<div class="market-notes"><span>'+icon('globe',13)+'Stocks: US-listed shares and ADRs of North American &amp; European companies. All prices in USD.</span><span>'+icon('shield',13)+'Explore freely. No account needed.</span></div></section></div>';
 renderTable();
}
function renderTable(){
 const watching=currentSection()==='watchlist';
 const filtered=selectAssets(state.assets,{category:watching?'watchlist':state.category,query:state.query,sort:state.sort,watchlist:state.watchlist});
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 state.page=Math.max(1,Math.min(state.page,pageCount));
 const shown=filtered.slice((state.page-1)*pageSize,state.page*pageSize);
 document.querySelector('#market-count').textContent=filtered.length+' assets';
 document.querySelectorAll('[data-category]').forEach(btn=>{const active=btn.dataset.category===state.category;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active);});
 if(!shown.length){
  const emptyWatch=watching&&state.watchlist.size===0;
  document.querySelector('#market-results').innerHTML='<div class="table-wrap empty-state">'+icon(emptyWatch?'star':'search',30)+'<h3>'+(emptyWatch?'Your watchlist starts here':'No matching assets')+'</h3><p>'+(emptyWatch?'Tap the star beside any asset to add it to this view.':'Try a different company, symbol, or market category.')+'</p>'+(emptyWatch?'<a href="/markets" data-nav class="primary-button">Explore markets '+icon('arrow',14)+'</a>':'<button class="outline-button" data-action="clear-search">Clear filters</button>')+'</div>';
  return;
 }
 document.querySelector('#market-results').innerHTML='<div class="table-wrap"><table class="market-table"><caption class="visually-hidden">Market prices in US dollars, including source status for each asset</caption><thead><tr><th scope="col"><span class="visually-hidden">Watchlist</span>'+icon('star',12)+'</th><th scope="col">Asset</th><th scope="col">Price</th><th scope="col">Day change</th><th scope="col" class="cap-column">Market cap</th><th scope="col">7D trend</th><th scope="col">Quote</th><th scope="col"><span class="visually-hidden">Open terminal</span></th></tr></thead><tbody>'+
 shown.map(a=>'<tr><td>'+watchButton(a)+'</td><td class="asset-cell"><a href="/trade/'+a.id+'" data-nav>'+identity(a)+'</a></td><td class="price-cell">'+money(a.quote.price)+'</td><td>'+change(a.quote)+'</td><td class="cap-column">'+compact(a.quote.marketCap)+'</td><td>'+sparkline(a.quote,true)+'</td><td>'+badge(a.quote)+'</td><td><a class="row-action" href="/trade/'+a.id+'" data-nav aria-label="Preview '+esc(a.name)+' market">View '+icon('arrow',11)+'</a></td></tr>').join('')+
 '</tbody></table></div><div class="table-bottom"><span>Showing '+((state.page-1)*pageSize+1)+'–'+Math.min(state.page*pageSize,filtered.length)+' of '+filtered.length+' assets</span><nav class="pagination" aria-label="Market pages"><button class="page-button" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+' aria-label="Previous page">‹</button>'+Array.from({length:pageCount},(_,i)=>'<button class="page-button '+(state.page===i+1?'active':'')+'" data-page="'+(i+1)+'" '+(state.page===i+1?'aria-current="page"':'')+' aria-label="Page '+(i+1)+'">'+(i+1)+'</button>').join('')+'<button class="page-button" data-page="'+(state.page+1)+'" '+(state.page===pageCount?'disabled':'')+' aria-label="Next page">›</button></nav></div>';
}
function tradeAsset(){return asset(location.pathname.split('/')[2]);}
function tradePage(){
 const a=tradeAsset();
 if(!a){main.innerHTML='<div class="empty-state"><h1>Asset not found</h1><p>Select an asset from the market overview.</p><a class="primary-button" href="/markets" data-nav>View markets</a></div>';return;}
 document.title=a.symbol+' / USD · Bluwhale';
 main.innerHTML='<div class="terminal-page"><div class="breadcrumbs"><a href="/markets" data-nav>Markets</a>'+icon('chevron',10)+'<span>'+esc(a.kind==='crypto'?'Crypto':a.region)+'</span>'+icon('chevron',10)+'<span>'+esc(a.symbol)+'</span></div>'+
 '<div class="terminal-top"><div class="instrument-picker"><label for="instrument">TRADING WORKSPACE</label><select id="instrument">'+['crypto','stock'].map(kind=>'<optgroup label="'+(kind==='crypto'?'Cryptocurrencies':'North American & European stocks')+'">'+state.assets.filter(x=>x.kind===kind).map(x=>'<option value="'+x.id+'" '+(x.id===a.id?'selected':'')+'>'+esc(x.symbol)+' / USD · '+esc(x.name)+'</option>').join('')+'</optgroup>').join('')+'</select><p>'+esc(a.name)+' · '+esc(a.venue)+(a.kind==='stock'?' · '+esc(a.country):' · 24/7 market')+'</p></div><div class="terminal-status"><span id="trade-badge">'+badge(a.quote)+'</span><button class="outline-button" data-trade-watch="'+a.id+'">'+icon('star',13)+'<span>'+(state.watchlist.has(a.id)?'Watching':'Watch asset')+'</span></button></div></div>'+
 '<div class="notice">'+icon('info',13)+'<span>Trading workspace preview. Explore an order estimate; no order is placed and no funds are moved.</span></div>'+
 '<div class="terminal-grid"><div><section class="chart-panel" aria-label="Price history"><div class="quote-strip" id="quote-strip"></div><div class="chart-toolbar"><div class="chart-instrument">'+icon('chart',18)+'<strong>'+esc(a.symbol)+' / USD</strong><span class="candle-interval">1h</span><span class="candle-mode">Candles</span></div><div class="segmented" aria-label="Chart range"><button data-range="1d" aria-pressed="'+(state.range==='1d')+'">1D</button><button data-range="7d" aria-pressed="'+(state.range==='7d')+'">7D</button></div></div><p id="chart-source" class="candle-source"></p><div id="chart-area" class="candle-area"></div><div class="chart-caption"><span id="quote-time"></span><span id="chart-hover" class="chart-hover"></span></div></section>'+
 '<section class="info-panel"><h2>About '+esc(a.name)+'</h2><p>'+esc(a.description)+'</p><dl class="asset-facts"><div><dt>Asset class</dt><dd>'+(a.kind==='crypto'?'Cryptocurrency':'Public equity')+'</dd></div><div><dt>'+(a.kind==='crypto'?'Quote currency':'Company region')+'</dt><dd>'+esc(a.kind==='crypto'?'US Dollar (USD)':a.region)+'</dd></div><div><dt>Listing</dt><dd>'+esc(a.venue)+'</dd></div></dl></section></div>'+
 '<aside class="terminal-sidebar"><section class="order-panel"><div class="panel-title"><h2>Order preview</h2><span class="demo-pill">DEMO</span></div><div class="side-tabs"><button class="buy active" data-side="buy" aria-pressed="true">Buy</button><button class="sell" data-side="sell" aria-pressed="false">Sell</button></div><div class="order-type"><button class="active" data-order-type="market" aria-pressed="true">Market</button><button data-order-type="limit" aria-pressed="false">Limit</button></div>'+
 '<form id="order-form"><div id="limit-field" hidden><label class="field-label" for="limit-price">Limit price</label><div class="number-field"><input id="limit-price" disabled type="number" step="any" min="0.00000001" inputmode="decimal" value="'+a.quote.price+'"><span>USD</span></div></div><label class="field-label" for="quantity">Quantity</label><div class="number-field"><input id="quantity" name="quantity" type="number" inputmode="decimal" step="any" min="0.00000001" placeholder="0.00" required autocomplete="off"><span>'+esc(a.symbol)+'</span></div><div class="quick-amounts" aria-label="Set example order value"><button type="button" data-amount="100">$100</button><button type="button" data-amount="500">$500</button><button type="button" data-amount="1000">$1,000</button></div><div class="estimate-row"><span>Estimated total</span><strong id="estimated-total">—</strong></div><p class="order-note">Indicative value before fees or slippage. <span id="order-source"></span></p><button class="order-submit" id="preview-order" type="submit">Preview buy</button><p class="input-error" id="order-error" role="status"></p><p class="order-disclaimer">'+icon('shield',11)+' Simulation only · No account required</p></form></section>'+
 '<section class="related-assets" id="related-assets"><h2>Also on your radar</h2>'+state.assets.filter(x=>x.kind===a.kind&&x.id!==a.id).slice(0,4).map(x=>'<a class="related-row" href="/trade/'+x.id+'" data-nav>'+mark(x)+'<span class="asset-label">'+esc(x.symbol)+'<span class="asset-subtitle">'+esc(x.name)+'</span></span>'+change(x.quote)+badge(x.quote)+'</a>').join('')+'</section></aside></div></div>';
 state.side='buy';state.orderType='market';state.quantity='';state.limit=String(a.quote.price);
 renderTradeQuote();
}
function renderTradeQuote(){
 const a=tradeAsset();if(!a||!document.querySelector('#quote-strip'))return;
 const q=a.quote;
 document.querySelector('#trade-badge').innerHTML=badge(q);
 document.querySelector('#quote-strip').innerHTML='<div class="main-price">'+money(q.price)+'</div><div class="quote-stat"><small>'+(a.kind==='crypto'?'24h':'Session')+' change</small>'+change(q)+'</div><div class="quote-stat"><small>'+(a.kind==='crypto'?'24h':'Session')+' high</small><span>'+money(q.high||NaN)+'</span></div><div class="quote-stat"><small>'+(a.kind==='crypto'?'24h':'Session')+' low</small><span>'+money(q.low||NaN)+'</span></div><div class="quote-stat cap-stat"><small>Market cap</small><span>'+compact(q.marketCap)+'</span></div>';
 document.querySelector('#quote-time').textContent=quoteDescription(q);
 document.querySelector('#order-source').textContent=q.status==='sample'?'Based on a sample price.':q.status==='stale'?'Based on a stale quote.':q.status==='delayed'?'Based on a delayed quote.':'Quote from '+q.source+'.';
 document.querySelectorAll('#related-assets .related-row').forEach(link=>{
  const related=asset(link.getAttribute('href').split('/').at(-1));
  if(related)link.innerHTML=mark(related)+'<span class="asset-label">'+esc(related.symbol)+'<span class="asset-subtitle">'+esc(related.name)+'</span></span>'+change(related.quote)+badge(related.quote);
 });
 renderChart();
 updateEstimate();
}
function renderChart(){
 const a=tradeAsset();if(!a)return;
 const q=a.quote;
 document.querySelector('#chart-source').textContent=q.chartSource+(q.chartUpdatedAt?' · History fetched '+new Date(q.chartUpdatedAt).toLocaleTimeString():'');
 document.querySelectorAll('[data-range]').forEach(btn=>{
  btn.classList.toggle('active',btn.dataset.range===state.range);
  btn.setAttribute('aria-pressed',btn.dataset.range===state.range);
  btn.disabled=!q.chart||q.chart.length<2;
 });
 const area=document.querySelector('#chart-area');
 if(renderCandles(area,a,state.range,value=>{document.querySelector('#chart-hover').textContent=value;})){document.querySelector('#chart-hover').textContent='';return;}
 const {values,times}=chartWindow(q,state.range);
 const geometry=chartGeometry(values,800,240,8,times);
 if(!geometry){
  document.querySelector('#chart-area').innerHTML='<div class="empty-state large-chart">'+icon('chart',28)+'<h3>History isn’t available</h3><p>The current quote provider does not include price history for this asset.</p></div>';
  document.querySelector('#chart-hover').textContent='';
  return;
 }
 const color=values.at(-1)>=values[0]?'var(--green)':'var(--red)';
 const grid=Array.from({length:5},(_,i)=>{
  const y=14+i*52;
  const value=geometry.max-(geometry.max-geometry.min)*i/4;
  return '<line x1="0" x2="800" y1="'+y+'" y2="'+y+'" class="chart-grid"/><text x="795" y="'+(y-5)+'" text-anchor="end" class="chart-axis">'+money(value)+'</text>';
 }).join('');
 const end=geometry.points.at(-1),start=geometry.points[0];
 const historyLabel=q.status==='sample'?'Illustrative sample chart':q.chartSource;
 const historyTime=seconds=>new Date(seconds*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 document.querySelector('#chart-area').innerHTML='<div class="large-chart"><svg id="price-chart" viewBox="0 0 800 240" preserveAspectRatio="none" role="img" aria-label="'+esc(a.name+' '+state.range+' '+historyLabel)+'"><defs><linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity=".17"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+geometry.path+' L '+end[0]+',240 L '+start[0]+',240 Z" fill="url(#price-fill)"/><path d="'+geometry.path+'" fill="none" stroke="'+color+'" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="'+end[0]+'" cy="'+end[1]+'" r="3" fill="'+color+'"/><line id="crosshair" y1="0" y2="240" stroke="var(--muted)" stroke-width=".7" stroke-dasharray="3 3" visibility="hidden"/></svg><div class="chart-axis-row"><span>'+(times.length?historyTime(times[0]):state.range==='1d'?'24 hours ago':'7 days ago')+'</span><span>'+(q.status==='sample'?'Illustrative timeline':'Hourly closes · gaps preserved')+'</span><span>'+(times.length?historyTime(times.at(-1)):'Latest point')+'</span></div></div>';
 document.querySelector('#chart-hover').textContent='';
 document.querySelector('#price-chart').addEventListener('pointermove',event=>{
  const box=event.currentTarget.getBoundingClientRect();
  const ratio=Math.max(0,Math.min(1,(event.clientX-box.left)/box.width));
  const pointerX=ratio*800;
  const index=geometry.points.reduce((best,point,i)=>Math.abs(point[0]-pointerX)<Math.abs(geometry.points[best][0]-pointerX)?i:best,0);
  const x=geometry.points[index][0];
  const line=document.querySelector('#crosshair');
  line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('visibility','visible');
  document.querySelector('#chart-hover').textContent=money(values[index]);
 });
 document.querySelector('#price-chart').addEventListener('pointerleave',()=>{
  document.querySelector('#crosshair').setAttribute('visibility','hidden');
  document.querySelector('#chart-hover').textContent='';
 });
}
function orderPrice(){return state.orderType==='limit'?Number(state.limit):tradeAsset()?.quote.price;}
function updateEstimate(){
 const value=estimate(state.quantity,orderPrice());
 const target=document.querySelector('#estimated-total');
 if(target)target.textContent=value===null?'—':money(value);
}
function orderPreview(event){
 event.preventDefault();
 const a=tradeAsset(),price=orderPrice(),total=estimate(state.quantity,price);
 if(total===null){document.querySelector('#order-error').textContent='Enter a positive quantity and a valid price.';return;}
 document.querySelector('#order-error').textContent='';
 openModal('Your '+state.side+' preview','<p class="dialog-copy">Explore the numbers for this '+esc(state.orderType)+' order. This preview does not submit a trade.</p><dl class="preview-details">'+[
 ['Asset',a.symbol+' / USD'],['Order type',state.orderType==='limit'?'Limit':'Market'],['Quantity',Number(state.quantity).toLocaleString('en-US',{maximumFractionDigits:8})+' '+a.symbol],['Indicative price',money(price)],['Estimated total',money(total)],['Quote source',state.orderType==='limit'?'Your example limit price':a.quote.source+' · '+a.quote.status]
 ].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><div class="notice">'+icon('info',13)+'<span>Fees and slippage are excluded. No order will be placed or saved.</span></div><button class="primary-button full-width" data-action="close-modal">Done exploring</button>');
}
function portfolioPage(){
 const account=location.pathname==='/user/account';
 const orders=location.pathname==='/orders';
 document.title=(account?'Account preview':orders?'Order previews':'Portfolio preview')+' · Bluwhale';
 const holdings=[{id:'bitcoin',qty:.12},{id:'ethereum',qty:1.5},{id:'bluai',qty:25000},{id:'nvda',qty:8},{id:'aapl',qty:5},{id:'asml',qty:1}].map(p=>({...p,a:asset(p.id)})).filter(p=>p.a);
 const total=holdings.reduce((sum,p)=>sum+p.qty*p.a.quote.price,0);
 const crypto=holdings.filter(p=>p.a.kind==='crypto').reduce((sum,p)=>sum+p.qty*p.a.quote.price,0);
 main.innerHTML='<div class="page"><div class="section-intro"><span class="eyebrow">EXPLORE THE EXPERIENCE</span><h1>'+(account?'Account preview':orders?'A view of your activity.':'Your markets, in balance.')+'</h1><p>A sample portfolio for exploring Bluwhale. These holdings do not belong to an account.</p></div><nav class="screen-tabs" aria-label="Portfolio screens"><a href="/portfolio" data-nav class="'+(!orders&&!account?'active':'')+'">Holdings</a><a href="/orders" data-nav class="'+(orders?'active':'')+'">Order previews</a><a href="/user/account" data-nav class="'+(account?'active':'')+'">Account preview</a></nav>'+
 (account?'<section class="info-panel account-note"><span class="demo-pill">PREVIEW</span><h2 style="margin-top:15px">No account connected</h2><p>Explore market prices, build a temporary watchlist, and preview an order. Account creation, profiles, deposits, and withdrawals are not enabled in this version.</p><a class="outline-button" href="/markets" data-nav>Back to markets '+icon('arrow',14)+'</a></section>':
 orders?'<div class="notice">'+icon('info',13)+'<span>Static examples of order history. Previewing an order in the terminal does not add a transaction here.</span></div><div class="table-wrap"><table class="market-table portfolio-table"><thead><tr><th>Asset</th><th>Side</th><th>Type</th><th>Example quantity</th><th>Status</th><th></th></tr></thead><tbody>'+[{id:'bitcoin',side:'Buy',qty:'0.05'},{id:'nvda',side:'Buy',qty:'4'},{id:'ethereum',side:'Sell',qty:'0.5'}].map(o=>'<tr><td>'+identity(asset(o.id))+'</td><td class="'+(o.side==='Buy'?'positive':'negative')+'">'+o.side+'</td><td>Market</td><td>'+o.qty+'</td><td><span class="quote-badge sample">Illustrative · unsubmitted</span></td><td><a class="row-action" href="/trade/'+o.id+'" data-nav>Explore</a></td></tr>').join('')+'</tbody></table></div>':
 '<div class="notice">'+icon('info',13)+'<span>Sample quantities valued using the displayed quotes, which may be live, delayed, stale, or sample. No balances are stored.</span></div><div class="portfolio-summary"><div class="portfolio-card"><p>Illustrative portfolio value <span class="demo-pill">DEMO</span></p><strong>'+money(total)+'</strong><div class="allocation">'+holdings.map(p=>'<span style="width:'+(p.qty*p.a.quote.price/total*100)+'%;--asset-color:'+esc(p.a.color)+'"></span>').join('')+'</div><small>'+holdings.length+' example positions · USD valuation</small></div><div class="portfolio-card"><p>Crypto allocation</p><strong>'+(crypto/total*100).toFixed(1)+'%</strong><small>'+money(crypto)+' in example holdings</small></div><div class="portfolio-card"><p>Equity allocation</p><strong>'+((total-crypto)/total*100).toFixed(1)+'%</strong><small>North American &amp; European companies</small></div></div><div class="market-head"><h2>Example holdings</h2><span class="demo-pill">ILLUSTRATIVE</span></div><div class="table-wrap"><table class="market-table portfolio-table"><thead><tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th><th>Quote</th><th></th></tr></thead><tbody>'+holdings.map(p=>'<tr><td>'+identity(p.a)+'</td><td>'+p.qty.toLocaleString()+'</td><td>'+money(p.a.quote.price)+'</td><td>'+money(p.qty*p.a.quote.price)+'</td><td>'+badge(p.a.quote)+'</td><td><a class="row-action" href="/trade/'+p.id+'" data-nav>Explore '+icon('arrow',11)+'</a></td></tr>').join('')+'</tbody></table></div>')+'</div>';
}
function render(){
 updateHeader();
 if(currentSection()==='trade')tradePage();
 else if(currentSection()==='portfolio')portfolioPage();
 else marketPage();
}
function renderUpdates(){
 updateHeader();
 if(currentSection()==='trade')renderTradeQuote();
 else if(currentSection()==='portfolio')portfolioPage();
 else{
  const featureCard=document.querySelector('#feature-card');if(featureCard)featureCard.innerHTML=feature();
  const spot=document.querySelector('#spotlights');if(spot)spot.innerHTML=spotlights();
  const notice=document.querySelector('#market-notice');if(notice)notice.innerHTML=marketNotice();
  if(document.querySelector('#market-results'))renderTable();
 }
}
function navigate(path){
 const url=new URL(path,location.origin);
 if(url.origin!==location.origin)return;
 history.pushState({},'',url.pathname);
 state.page=1;state.query='';state.range='7d';
 if(state.assets.length)render();
 window.scrollTo({top:0,behavior:'instant'});
 main.focus({preventScroll:true});
}
let toastTimer;
function toast(message){
 const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);
}
function toggleWatch(id){
 const a=asset(id);if(!a)return;
 if(state.watchlist.has(id)){state.watchlist.delete(id);toast(a.symbol+' removed from your watchlist');}
 else{state.watchlist.add(id);toast(a.symbol+' added to your watchlist');}
 if(currentSection()==='trade'){
  const btn=document.querySelector('[data-trade-watch]');if(btn){btn.querySelector('span').textContent=state.watchlist.has(id)?'Watching':'Watch asset';btn.setAttribute('aria-pressed',state.watchlist.has(id));}
 }else{
  renderTable();
  document.querySelector('[data-watch="'+id+'"]')?.focus({preventScroll:true});
 }
}
function openModal(title,html){
 document.querySelector('#modal-title').textContent=title;
 document.querySelector('#modal-body').innerHTML=html;
 if(!modal.open)modal.showModal();
}
function showSources(){
 const feeds=state.feeds.length?state.feeds:[{name:'Coinbase',status:'connecting'}];
 openModal('Behind the prices','<p class="dialog-copy">Supported crypto prices refresh every 30 seconds using Coinbase’s public Exchange API. No API key or account is needed.</p>'+feeds.map(f=>'<div class="source-row"><div><strong>'+esc(f.name)+'</strong><span class="source-status '+esc(f.status)+'">'+esc(f.status)+'</span></div><p>USD market quotes and hourly price history. Quote time is the fetch time. History is refreshed separately every 15 minutes. <a href="https://www.coinbase.com/" target="_blank" rel="noopener noreferrer">Coinbase ↗</a></p></div>').join('')+'<p class="dialog-footnote"><strong>Sample</strong> values and charts are illustrative. BLUAI and stocks have no supported USD pairs in this Coinbase feed and remain sample previews. <strong>Stale</strong> means an older quote could not be refreshed. Refresh interval: '+state.refreshSeconds+' seconds.<br><br>Prices are in USD. Stock listings include shares and ADRs; these are not tokenized stocks.</p>');
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.matches('[data-nav]')){
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();navigate(target.href);return;
 }
 if(target.dataset.watch)toggleWatch(target.dataset.watch);
 if(target.dataset.tradeWatch)toggleWatch(target.dataset.tradeWatch);
 if(target.dataset.category){state.category=target.dataset.category;state.page=1;renderTable();}
 if(target.dataset.page){state.page=Number(target.dataset.page);renderTable();document.querySelector('[aria-current="page"].page-button')?.focus();}
 if(target.dataset.range){state.range=target.dataset.range;renderChart();}
 if(target.dataset.side){
  state.side=target.dataset.side;
  document.querySelectorAll('[data-side]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.side===state.side);btn.setAttribute('aria-pressed',btn.dataset.side===state.side);});
  const submit=document.querySelector('#preview-order');submit.textContent='Preview '+state.side;submit.classList.toggle('sell',state.side==='sell');
 }
 if(target.dataset.orderType){
  state.orderType=target.dataset.orderType;
  document.querySelectorAll('[data-order-type]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.orderType===state.orderType);btn.setAttribute('aria-pressed',btn.dataset.orderType===state.orderType);});
  document.querySelector('#limit-field').hidden=state.orderType!=='limit';
  document.querySelector('#limit-price').required=state.orderType==='limit';
  document.querySelector('#limit-price').disabled=state.orderType!=='limit';
  updateEstimate();
 }
 if(target.dataset.amount){
  const price=orderPrice();
  if(price>0){state.quantity=(Number(target.dataset.amount)/price).toFixed(8);document.querySelector('#quantity').value=state.quantity;updateEstimate();}
 }
 const action=target.dataset.action;
 if(action==='sources'||target.id==='feed-button'||target.id==='footer-sources')showSources();
 if(action==='browse')document.querySelector('#market-section')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 if(action==='clear-search'){state.query='';state.category='all';document.querySelector('#market-search').value='';renderTable();}
 if(action==='close-modal'||target.id==='close-modal')modal.close();
 if(target.id==='theme-toggle'){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';updateHeader();}
 if(action==='retry')loadQuotes();
});
document.addEventListener('input',event=>{
 if(event.target.id==='market-search'){state.query=event.target.value;state.page=1;renderTable();}
 if(event.target.id==='quantity'){state.quantity=event.target.value;document.querySelector('#order-error').textContent='';updateEstimate();}
 if(event.target.id==='limit-price'){state.limit=event.target.value;updateEstimate();}
});
document.addEventListener('change',event=>{
 if(event.target.id==='market-sort'){state.sort=event.target.value;state.page=1;renderTable();}
 if(event.target.id==='instrument')navigate('/trade/'+event.target.value);
});
document.addEventListener('submit',event=>{if(event.target.id==='order-form')orderPreview(event);});
document.addEventListener('keydown',event=>{
 if(event.key==='/'&&!modal.open&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
  const search=document.querySelector('#market-search');if(search){event.preventDefault();search.focus();}
 }
});
window.addEventListener('popstate',()=>{state.page=1;if(state.assets.length)render();});
let loading=false;
let firstLoad=true;
async function loadQuotes(){
 if(loading)return;
 loading=true;
 try{
  const response=await fetch('/api/markets',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Market service unavailable');
  const snapshot=await response.json();
  if(!Array.isArray(snapshot.assets)||!snapshot.assets.length)throw new Error('No market data');
  state.assets=snapshot.assets;state.feeds=snapshot.feeds;state.updatedAt=snapshot.updatedAt;state.refreshSeconds=snapshot.refreshSeconds;
  state.connected=true;
  if(firstLoad){firstLoad=false;render();}else renderUpdates();
 }catch{
  state.connected=false;
  state.assets=state.assets.map(a=>({...a,quote:{...a.quote,status:a.quote.status==='sample'?'sample':'stale'}}));
  if(firstLoad){
   main.innerHTML='<div class="loading-state"><h1>Markets are temporarily unavailable</h1><p>The local market service could not be reached.</p><button class="primary-button" style="margin-top:20px" data-action="retry">Try again</button></div>';
   updateHeader();
  }else renderUpdates();
 }finally{loading=false;}
}
updateHeader();
await loadQuotes();
// Re-check startup quickly, then poll the shared server cache every 30 seconds.
for(const delay of [2500,8000,18000])setTimeout(loadQuotes,delay);
setInterval(loadQuotes,QUOTE_REFRESH_MS);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadQuotes();});

let chartResizeTimer;
window.addEventListener('resize',()=>{clearTimeout(chartResizeTimer);chartResizeTimer=setTimeout(()=>{if(currentSection()==='trade'&&document.querySelector('#chart-area'))renderChart();},150);});
