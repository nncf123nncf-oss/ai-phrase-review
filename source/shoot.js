// 投稿カード用の素材を撮る（Chrome headless / CDP・DPR2）。実行: node source/shoot.js <出力フォルダ>
// 01-x-primary: 見本の文を入れた直後。狭い画面で、② 印のついた文と ③ 件数・種類ごとの数
// 02-fixed: 一覧で言い換えを選んだ後の ④ 直した文（実際に画面で押した結果。選んだ候補は PICK）
// 03-items: 同じ状態の ③ 見直し候補（押した候補つき）（予備）
// 見本はすべて架空（パン工房 みほん）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8784, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const rectEv = js => `(()=>{const e=${js};const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`;
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
const pad = (a, p) => ({ x: Math.max(0, a.x - p), y: Math.max(0, a.y - p), width: a.w + p * 2, height: a.h + p * 2 });
const report = (name, c) => console.log(name, JSON.stringify({ w: Math.round(c.width), h: Math.round(c.height), ratio: +(c.width / c.height).toFixed(3) }));
const W1 = +(process.env.SHOT_W1 || 560), W2 = +(process.env.SHOT_W2 || 520);

(async () => {
  const b = await launch(9476);
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });

  // 01: 狭い画面で ② 印のついた文と、その下の ③ 件数・種類ごとの数
  await b.open(ORIGIN, W1, 2400, 2, true, 'light');
  await b.ev(`document.getElementById('sample').click()`); await b.sleep(300);
  const c1 = pad(union(await b.ev(rectEv(`document.querySelector('.a-mk')`)), await b.ev(rectEv(`document.getElementById('summary')`))), 10); report('01-x-primary', c1);
  await b.shot(path.join(OUT, '01-x-primary.png'), c1);

  // 02・03: 狭い画面で全部1番目の候補を押す
  await b.open(ORIGIN, W2, 2400, 2, true, 'light');
  await b.ev(`document.getElementById('sample').click()`); await b.sleep(300);
  // 押す候補（印の番号: 候補）。4・5は「このまま」を選ぶ（自分の言い方なら残す、を見せる）
  const PICK = { 1: '削る', 2: '使った', 3: '削る', 4: 'このまま', 5: 'このまま', 6: 'だと思います', 7: '良さ', 8: '生かす', 9: 'ことを大事にしています', 10: 'お気軽に', 11: 'てください', 12: 'お待ちしています' };
  const n = await b.ev(`(()=>{const P=${JSON.stringify(PICK)};let n=0;for(const k in P){const bt=document.querySelector('#items button[data-n="'+k+'"][data-v="'+P[k]+'"]');if(!bt)throw new Error('no '+k);bt.click();n++}return n})()`);
  console.log('押した候補', n);
  const fixed = await b.ev(`document.getElementById('fixed').value`);
  console.log('--- 直した文 ---\n' + fixed + '\n---');
  const sh = await b.ev(`(()=>{const t=document.getElementById('fixed');return [t.clientHeight,t.scrollHeight]})()`);
  console.log('fixed textarea client/scroll', sh);
  const c2 = pad(await b.ev(rectEv(`document.querySelector('.a-fx')`)), 8); report('02-fixed', c2);
  await b.shot(path.join(OUT, '02-fixed.png'), c2);
  const c3 = pad(await b.ev(rectEv(`document.querySelector('.side')`)), 8); report('03-items', c3);
  await b.shot(path.join(OUT, '03-items.png'), c3);
  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
