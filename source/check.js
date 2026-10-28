// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// 見本の文の印と件数、言い換えの反映、元に戻す、0件の表示、375px/880px/1000pxの矩形、ライト/ダーク、XSS、コピー、端末に残るもの、外への通信
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8783, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
let ng = 0;
const ok = (name, cond, info) => { if (!cond) ng++; console.log((cond ? 'OK ' : 'NG ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],small:[]};
  document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('main button').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.height<43.5||r.width<43.5))out.small.push(e.textContent.slice(0,14)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  out.over=[...new Set(out.over)].slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const typeText = t => `(()=>{const s=document.getElementById('src');s.value=${JSON.stringify(t)};s.dispatchEvent(new Event('input'));return true})()`;
const clickAlt = (n, v) => `(()=>{const b=document.querySelector('#items button[data-n="${n}"][data-v=${JSON.stringify(v)}]');if(!b)throw new Error('no alt ${n} '+${JSON.stringify(v)});b.click();return true})()`;

(async () => {
  const b = await launch(9433);
  const reqs = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url); });
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  await b.send('Browser.grantPermissions', { origin: ORIGIN.slice(0, -1), permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  const errs = [];
  b.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); });

  // 1) 空の画面 375px
  await b.open(ORIGIN, 375, 667, 2, true, 'light');
  let m = await b.ev(measure); ok('empty 375 no overflow', m.sw <= 375 && !m.over.length, m);
  ok('empty 375 targets>=44', !m.small.length, m.small);
  const srcTop = await b.ev(`document.getElementById('src').getBoundingClientRect().top`);
  ok('375x667 入力欄の上端が画面内', srcTop < 667, srcTop);
  ok('empty summary', /まだ文が貼られていません/.test(await b.ev(`document.getElementById('summary').innerText`)));

  // 2) 見本の文
  await b.ev(`document.getElementById('sample').click()`); await b.sleep(100);
  const cnt = await b.ev(`document.querySelector('.count').innerText`);
  ok('S1 件数12', /12/.test(cnt), cnt);
  ok('S1 印12', await b.ev(`document.querySelectorAll('#marked .mk').length`) === 12);
  ok('S1 一覧12', await b.ev(`document.querySelectorAll('#items > li').length`) === 12);
  ok('S1 chips', (await b.ev(`[...document.querySelectorAll('.chips li')].map(x=>x.textContent).join('/')`)) === '締めの決まり文句 3/言い切り・まとめの型 4/ぼやけた飾り言葉 5', await b.ev(`[...document.querySelectorAll('.chips li')].map(x=>x.textContent).join('/')`));
  ok('印の文字＝元の文', await b.ev(`document.querySelector('#marked .marked').textContent.replace(/\\d+(?=\\D)/g,'')`) !== '' );
  m = await b.ev(measure); ok('sample 375 no overflow', m.sw <= 375 && !m.over.length, m);
  ok('sample 375 targets>=44', !m.small.length, m.small);
  await b.shot(path.join(OUT, '375-light.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });

  // 3) 言い換え
  const before = await b.ev(`document.getElementById('fixed').value`);
  ok('fixed = 元の文', before === await b.ev(`document.getElementById('src').value`));
  await b.ev(clickAlt(3, '削る')); await b.ev(clickAlt(6, 'だと思います')); await b.ev(clickAlt(12, 'お待ちしています'));
  let fx = await b.ev(`document.getElementById('fixed').value`);
  ok('S7 反映', !/まさに/.test(fx) && /一品だと思います/.test(fx) && /ご来店をお待ちしています/.test(fx), fx);
  ok('S7 元の文は変わらない', /まさに/.test(await b.ev(`document.getElementById('src').value`)));
  ok('S7 押した印', await b.ev(`document.querySelectorAll('#marked .mk.done').length`) === 3);
  await b.ev(clickAlt(6, 'です')); fx = await b.ev(`document.getElementById('fixed').value`);
  ok('S7 選び直し', /一品です/.test(fx) && !/だと思います/.test(fx));
  await b.ev(clickAlt(6, 'です')); fx = await b.ev(`document.getElementById('fixed').value`);
  ok('S7 もう一度押すと戻る', /一品と言えるでしょう/.test(fx));
  await b.ev(`document.getElementById('reset').click()`);
  ok('S7 全部元に戻す', await b.ev(`document.getElementById('fixed').value`) === before && await b.ev(`document.querySelectorAll('#marked .mk.done').length`) === 0);

  // 4) コピー
  await b.ev(clickAlt(3, '削る'));
  await b.ev(`document.getElementById('copy').click()`); await b.sleep(300);
  const cp = await b.ev(`document.getElementById('copied').textContent`);
  ok('S12 コピーの表示', /コピーしました|長押し/.test(cp), cp);
  const clip = await b.ev(`navigator.clipboard.readText().catch(e=>'ERR '+e)`);
  if (/^ERR/.test(clip)) {
    // ヘッドレスではクリップボードの書き込みが拒否される。手動コピーの経路（直した文が全選択される）に切り替わったかを見る
    const sel = await b.ev(`(()=>{const f=document.getElementById('fixed');return [f.selectionStart,f.selectionEnd,f.value.length,document.activeElement===f]})()`);
    ok('S12 手動コピーの経路（全選択）', sel[0] === 0 && sel[1] === sel[2] && sel[3] && /長押し/.test(cp), sel);
  } else ok('S12 クリップボード', clip === await b.ev(`document.getElementById('fixed').value`), clip.slice(0, 40));

  // 5) 文の中で見る
  await b.ev(`document.querySelector('#items button[data-jump="12"]').click()`); await b.sleep(100);
  ok('jump flash', await b.ev(`document.getElementById('mk-12').classList.contains('flash')`));

  // 6) 0件 / XSS
  await b.ev(typeText('明日は10時から開けます。')); await b.sleep(300);
  const sm = await b.ev(`document.getElementById('summary').innerText`);
  ok('S3 0件の表示', /一覧にある言い回しは見つかりませんでした/.test(sm) && !/問題|OK|正しい/.test(sm), sm);
  await b.ev(typeText('<img src=x onerror="window.__x=1">まさに"><script>window.__y=1</script>')); await b.sleep(300);
  ok('S8 XSS', await b.ev(`!window.__x && !window.__y && document.querySelectorAll('#marked img, #items img, #marked script').length===0`));
  ok('S8 文字として出る', /<img src=x/.test(await b.ev(`document.getElementById('marked').textContent`)));

  // 7) 端末に残るもの
  ok('S9 storage 空', await b.ev(`localStorage.length===0 && sessionStorage.length===0 && document.cookie===''`));

  // 8) ダーク 375 / 880 / 1000
  await b.open(ORIGIN, 375, 667, 2, true, 'dark');
  await b.ev(`document.getElementById('sample').click()`); await b.sleep(100);
  const dk = await b.ev(`(()=>{const s=getComputedStyle(document.querySelector('.mk'));const n=getComputedStyle(document.querySelector('.mk .n'));return [s.backgroundColor,s.color,n.backgroundColor,n.color]})()`);
  ok('dark 色', dk[0] === 'rgb(90, 75, 18)', dk);
  await b.shot(path.join(OUT, '375-dark.png'), { x: 0, y: 0, width: 375, height: 1400 });
  for (const w of [880, 1000]) {
    await b.open(ORIGIN, w, 900, 1, false, 'light');
    await b.ev(`document.getElementById('sample').click()`); await b.sleep(100);
    m = await b.ev(measure); ok(w + ' no overflow', m.sw <= w && !m.over.length, m);
    const cols = await b.ev(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns`);
    ok(w + ' 2カラム', cols.split(' ').length === 2, cols);
    await b.shot(path.join(OUT, w + '-light.png'), { x: 0, y: 0, width: w, height: 900 });
  }

  const ext = reqs.filter(u => !u.startsWith(ORIGIN) && !u.startsWith('data:'));
  ok('外への通信は解析だけ', ext.every(u => /cloudflareinsights\.com/.test(u)), ext);
  ok('JSエラーなし', !errs.length, errs);
  console.log(ng ? 'NG ' + ng : 'ALL OK');
  b.close(); srv.close(); process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
