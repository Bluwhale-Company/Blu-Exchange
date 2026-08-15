export function escapeHTML(value) {
 return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function money(value) {
 if (!Number.isFinite(value)) return '—';
 return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:value>0&&value<1?4:2,maximumFractionDigits:value>0&&value<1?6:2}).format(value);
}
export function compact(value) {
 return Number.isFinite(value)&&value>0 ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value) : '—';
}
export function percent(value) {
 return Number.isFinite(value) ? (value>=0?'+':'')+value.toFixed(2)+'%' : '—';
}
export function selectAssets(assets,{category='all',query='',sort='featured',watchlist=new Set()}={}) {
 const term=query.trim().toLowerCase();
 const result=assets.filter(a=>{
  const matches=category==='all'||(category==='crypto'&&a.kind==='crypto')||(category==='north-america'&&a.region==='North America')||(category==='europe'&&a.region==='Europe')||(category==='watchlist'&&watchlist.has(a.id));
  return matches && [a.symbol,a.name,a.country].some(value=>value.toLowerCase().includes(term));
 });
 if(sort==='gainers') result.sort((a,b)=>(b.quote.change??-Infinity)-(a.quote.change??-Infinity));
 if(sort==='losers') result.sort((a,b)=>(a.quote.change??Infinity)-(b.quote.change??Infinity));
 if(sort==='price-high') result.sort((a,b)=>b.quote.price-a.quote.price);
 if(sort==='name') result.sort((a,b)=>a.name.localeCompare(b.name));
 return result;
}
export function estimate(quantity,price) {
 const qty=Number(quantity), rate=Number(price);
 if (!Number.isFinite(qty)||!Number.isFinite(rate)||qty<=0||rate<=0||qty>1e12) return null;
 const total=qty*rate;
 return Number.isFinite(total)&&total<=1e15 ? total : null;
}
export const QUOTE_REFRESH_MS = 30_000;

export function chartWindow(quote,range,now=Date.now()) {
 const values=quote.chart || [];
 if(!quote.chartTimes?.length) return {values:range==='1d'?values.slice(-24):values,times:[]};
 const cutoff=now/1000-(range==='1d'?24:168)*3600;
 const points=quote.chartTimes.map((time,i)=>({time,value:values[i]})).filter(p=>p.time>=cutoff&&p.time<=now/1000);
 return {values:points.map(p=>p.value),times:points.map(p=>p.time)};
}

export function chartGeometry(values,width=800,height=240,padding=12,times=[]) {
 if(!Array.isArray(values)||values.length<2||values.some(v=>!Number.isFinite(v)||v<=0)) return null;
 if(times.length&&(times.length!==values.length||times.some((v,i)=>!Number.isFinite(v)||(i>0&&v<=times[i-1])))) return null;
 let min=Math.min(...values), max=Math.max(...values);
 const spread=Math.max(max-min,max*0.002);
 min-=spread*0.15; max+=spread*0.15;
 const points=values.map((v,i)=>[padding+(times.length?(times[i]-times[0])/(times.at(-1)-times[0]):i/(values.length-1))*(width-2*padding),height-padding-(v-min)/(max-min)*(height-2*padding)]);
 return {path:points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)).join(' '),points,min,max};
}
