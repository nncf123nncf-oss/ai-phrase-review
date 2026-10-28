// 純ロジックの検算。実行: node source/core-test.js
// index.html の <script id="core"> を取り出して読み込み、言い回しの拾い方・見た目の癖・言い換えの差し込みを確かめる
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = { module: { exports: {} }, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const AP = ctx.module.exports;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log('NG', name, '\n  got ', g, '\n  want', w); }
}
const ids = t => AP.scan(t).items.map(f => f.id);
const texts = t => AP.scan(t).items.map(f => f.text);
const alts = t => AP.scan(t).items.map(f => f.alts);

// ---- S1 見本の文 ----
const r1 = AP.scan(AP.SAMPLE);
eq('S1 ids', r1.items.map(f => f.id), ['C1', 'B9', 'C10', 'C3', 'C8', 'B1', 'C6', 'B8', 'B3', 'A3', 'A2', 'A5']);
eq('S1 count', r1.items.length, 12);
eq('S1 byCat', JSON.parse(JSON.stringify(r1.byCat)), { C: 5, B: 4, A: 3 });
eq('S1 lines', r1.items.map(f => f.line), [2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6]);
eq('S1 texts', r1.items.map(f => f.text), ['さまざまな', '活用した', 'まさに', '至福のひとときを', '演出してくれる', 'と言えるでしょう', '魅力', '最大限に引き出す', 'ことが、私たちにとって何よりも重要です', 'ぜひお気軽に', 'てみてはいかがでしょうか', '心よりお待ちしております']);

// ---- S2 一覧の全項目 ----
const all = [
  ['いかがでしたか', 'A1'], ['いかがでしたでしょうか', 'A1'], ['試してみてはいかがでしょうか', 'A2'], ['読んでみてはいかがでしょうか', 'A2'],
  ['ぜひお気軽に', 'A3'], ['ぜひ、お気軽に', 'A3'], ['参考になれば幸いです', 'A4'], ['お役に立てれば幸いです', 'A4'], ['心よりお待ちしております', 'A5'],
  ['素敵な週末をお過ごしください', 'A6'], ['と言えるでしょう', 'B1'], ['といえるでしょう', 'B1'], ['ではないでしょうか', 'B2'], ['続けることが大切です', 'B3'],
  ['鍵となります', 'B4'], ['カギとなる', 'B4'], ['店舗において', 'B5'], ['予約に関しては', 'B6'], ['予約することで', 'B7'], ['良さを最大限に引き出します', 'B8'],
  ['活用して', 'B9'], ['提供しております', 'B10'], ['を実現します', 'B11'], ['様々な', 'C1'], ['幅広い', 'C2'], ['特別なひととき', 'C3'], ['心温まる', 'C4'],
  ['ワンランク上の', 'C5'], ['魅力的な', 'C6'], ['食卓を彩る', 'C7'], ['演出します', 'C8'], ['五感で', 'C9'], ['まさに', 'C10'], ['となっております', 'D2'],
  ['ご利用いただけます', 'D4'], ['誠に', 'D5']
];
all.forEach(([t, id]) => eq('S2 ' + t, ids(t), [id]));
eq('S2 B4 alt ます', alts('鍵となります')[0], ['決め手です']);
eq('S2 B4 alt なる', alts('カギとなる')[0], ['決め手になる']);
eq('S2 B4 alt ました', alts('鍵となりました')[0], ['決め手でした']);
eq('S2 A2 alt', alts('試してみてはいかがでしょうか')[0], ['てみてください', 'てください']);
eq('S2 A2 alt で', alts('読んでみてはいかがでしょうか')[0], ['でみてください', 'でください']);
eq('S2 B8 alt', alts('最大限に引き出し')[0], ['生かし']);
eq('S2 B9 alts', ['活用した', '活用して', '活用する', '活用します', '活用できます'].map(t => alts(t)[0][0]), ['使った', '使って', '使う', '使います', '使えます']);
eq('S2 B6 alt', [alts('に関して')[0], alts('に関しては')[0]], [['について'], ['については']]);
eq('S2 C6', [alts('魅力')[0], alts('魅力的な')[0]], [['良さ', '削る'], ['削る']]);
eq('S2 C7 色彩は拾わない', ids('色彩り豊か'), []);
eq('S2 B11 alt', [alts('を実現します')[0], alts('を実現できる')[0]], [['ができます'], ['ができる']]);

// ---- S3 拾わない普通の文 ----
eq('S3 普通の文', ids('明日は10時から開けます。\n新しいパンも並びます。'), []);
eq('S3 空', AP.scan('').items.length, 0);

// ---- S4 2回目から ----
eq('S4 1回', ids('ご案内させていただきます。'), []);
eq('S4 2回', ids('ご案内させていただきます。お送りさせていただきました。'), ['D1']);
eq('S4 2回 alt', alts('ご案内させていただきます。お送りさせていただきました。')[0], ['しました', 'いたしました']);
eq('S4 でございます', ids('こちらでございます。あちらでございます。'), ['D3']);

// ---- S5 見た目の癖 ----
eq('S5 #', ids('## 見出し\n本文'), ['E1']);
eq('S5 **', ids('**太字**です'), ['E1', 'E1']);
eq('S5 箇条書き', ids('- いちご\n- りんご'), ['E1', 'E1']);
eq('S5 ---', ids('上\n---\n下'), ['E1']);
eq('S5 ダッシュ', ids('秋——実りの季節'), ['E2']);
eq('S5 ！4個は出ない', ids('あ！い！う！え！'), []);
eq('S5 ！5個', ids('あ！い！う！え！お!'), ['E3', 'E3', 'E3', 'E3', 'E3']);
eq('S5 【】2つは出ない', ids('【新作】\n【営業】'), []);
eq('S5 【】3つ', ids('【新作】\n【営業】\n【予約】'), ['E5', 'E5', 'E5']);
eq('S5 【】alt', alts('【新作】\n【営業】\n【予約】')[0], ['新作']);
eq('S5 文末3連続 ids', ids('パンを焼きます。毎朝焼きます。夜も焼きます。'), ['E4', 'E4', 'E4']);
eq('S5 文末2連続は出ない', ids('パンを焼きます。毎朝焼きます。夜はお休みです。'), []);
eq('S5 文末 text', texts('来週も開いています。毎日開いています。夜も開いています。'), ['ます', 'ます', 'ます']);

// ---- S6 URL・メールの中 ----
eq('S6 URL', ids('詳しくは https://example.com/ikagadeshitaka/samazamana を見てください'), []);
eq('S6 mail', ids('makotoni@example.com まで'), []);
eq('S6 全角URLでも位置がずれない', AP.norm('ＡＢＣ').length, 3);

// ---- S7 言い換えの差し込み ----
const r7 = AP.scan(AP.SAMPLE);
eq('S7 何も選ばない', AP.applyChoices(r7, {}), AP.SAMPLE);
const ch = {};
r7.items.forEach(f => { ch[f.n] = f.alts[0]; });
const fixedAll = AP.applyChoices(r7, ch);
eq('S7 元は変わらない', r7.text, AP.SAMPLE);
console.log('--- S7 全部1番目の候補にした結果 ---\n' + fixedAll + '\n---');
eq('S7 このまま', AP.applyChoices(r7, { 1: AP.KEEP }), AP.SAMPLE);
eq('S7 削る', AP.applyChoices(AP.scan('まさに一品'), { 1: AP.CUT }), '一品');
eq('S7 ぜひ', AP.applyChoices(AP.scan('ぜひお気軽にどうぞ'), { 1: 'お気軽に' }), 'お気軽にどうぞ');

// ---- その他: 上限・XSS文字列でも落ちない ----
eq('MAX', AP.scan('あ'.repeat(6000)).text.length, 5000);
eq('XSS 文字列', ids('<img src=x onerror=alert(1)>まさに"><script>'), ['C10']);
const big = (AP.SAMPLE + '\n').repeat(40).slice(0, 5000);
let t0 = Date.now(); for (let i = 0; i < 20; i++) AP.scan(big); const ms = (Date.now() - t0) / 20;
console.log('5,000字の照合 1回あたり ' + ms.toFixed(1) + 'ms（' + AP.scan(big).items.length + 'か所）');
eq('5000字が50ms未満', ms < 50, true);

console.log(`pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
