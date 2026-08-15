import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHTML, money, percent, selectAssets, estimate, chartGeometry, chartWindow} from '../ui/static/js/core.mjs';

const assets=[
 {id:'bluai',symbol:'BLUAI',name:'BluAI',country:'',kind:'crypto',region:'Global',quote:{price:.01,change:2}},
 {id:'nvda',symbol:'NVDA',name:'NVIDIA',country:'United States',kind:'stock',region:'North America',quote:{price:100,change:-1}},
 {id:'asml',symbol:'ASML',name:'ASML',country:'Netherlands',kind:'stock',region:'Europe',quote:{price:700,change:0}},
 {id:'sap',symbol:'SAP',name:'SAP',country:'Germany',kind:'stock',region:'Europe',quote:{price:200,change:null}}
];
test('market filters combine region, search, sorting, and temporary watchlist',()=>{
 assert.deepEqual(selectAssets(assets,{category:'europe',query:' nether '}).map(a=>a.id),['asml']);
 assert.deepEqual(selectAssets(assets,{category:'crypto'}).map(a=>a.id),['bluai']);
 assert.deepEqual(selectAssets(assets,{category:'north-america'}).map(a=>a.id),['nvda']);
 assert.deepEqual(selectAssets(assets,{category:'watchlist',watchlist:new Set(['asml','bluai'])}).map(a=>a.id),['bluai','asml']);
 assert.deepEqual(selectAssets(assets,{sort:'gainers'}).map(a=>a.id),['bluai','asml','nvda','sap']);
 assert.deepEqual(selectAssets(assets,{sort:'losers'}).map(a=>a.id),['nvda','asml','bluai','sap']);
 assert.equal(assets[0].id,'bluai','sorting must not reorder the source catalog');
 assert.deepEqual(selectAssets(assets,{query:'missing'}),[]);
});
test('order estimates reject empty, negative, non-finite and excessive values',()=>{
 assert.equal(estimate('0.125',100),12.5);
 for(const quantity of ['',0,-1,NaN,Infinity,'bad',1e13])assert.equal(estimate(quantity,100),null);
 for(const price of [0,-1,NaN,Infinity])assert.equal(estimate(1,price),null);
 assert.equal(estimate(1e12,1e12),null);
});
test('chart geometry handles flat history and missing or invalid data',()=>{
 assert.equal(chartGeometry(null),null);
 assert.equal(chartGeometry([1]),null);
 assert.equal(chartGeometry([1,NaN]),null);
 assert.equal(chartGeometry([0,1]),null);
 const flat=chartGeometry([100,100,100]);
 assert.ok(flat.min<100&&flat.max>100);
 assert.equal(flat.points.length,3);
 assert.ok(!flat.path.includes('NaN'));
});
test('source text is escaped and unavailable values are not displayed as zero',()=>{
 assert.equal(escapeHTML('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
 assert.equal(money(NaN),'—');
 assert.equal(percent(null),'—');
 assert.equal(percent(0),'+0.00%');
 assert.equal(money(.01284),'$0.01284');
});

test('Coinbase chart ranges use timestamps and preserve gaps without inventing prices',()=>{
 const now=Date.UTC(2026,8,9,12)/1000;
 const q={chart:[10,20,30,40],chartTimes:[now-48*3600,now-24*3600,now-22*3600,now-3600]};
 const day=chartWindow(q,'1d',now*1000);
 assert.deepEqual(day.values,[20,30,40]);
 assert.equal(chartWindow(q,'7d',now*1000).values.length,4);
 assert.equal(chartWindow(q,'1d',(now+48*3600)*1000).values.length,0);
 const geometry=chartGeometry(day.values,250,100,10,day.times);
 assert.equal(geometry.points[0][0],10);
 assert.equal(geometry.points[1][0],30);
 assert.equal(geometry.points[2][0],240);
 assert.equal(chartGeometry([1,2],100,100,10,[10,10]),null);
});
