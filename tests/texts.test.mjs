import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'texts');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const P = await D('sim/prompt.js'); const T = await D('sim/textlog.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };

seed(3);
const w = world(ext, 'modern'); W.registerWorld(w);
meta.mundi = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'v0.1.0-modern.json'), 'utf8'));
const g = store.game();
g.day = 10; g.minutes = 15 * 60;
const now = store.nowAbs(g);
const mia = { avatar: 'ex0.png', name: g.cast['ex0.png'].name, met: true };
g.social.threads = {
    'ex0.png': [
        { me: true, text: 'Five days ago, too old', at: now - 5 * 1440 },
        { me: false, text: 'Ugh, work was brutal.', at: (g.day - 1) * 1440 + 21 * 60 },
        { me: true, text: 'Still on for tonight?', at: g.day * 1440 + 9 * 60 + 10 },
        { me: false, text: 'Wouldn\'t miss it', at: g.day * 1440 + 9 * 60 + 12 },
        { me: true, text: 'From the future', at: now + 60 },
    ],
    'ex1.png': [{ me: true, text: 'Helena only', at: now - 30 }],
};

const block = T.textBlockFor(g, w, mia);
ok(block.includes('Still on for tonight?') && block.includes('Ugh, work was brutal.'), 'texts from the last 3 days are sent');
ok(!block.includes('too old'), 'texts older than 3 days are not');
ok(!block.includes('From the future'), 'nothing after now');
ok(/Today, morning — about 6 hours ago:/.test(block), 'a 6-hour-old text says so');
ok(/Yesterday, evening — about 18 hours ago:/.test(block), 'yesterday is labelled');
ok(block.includes('09:10 {{user}}: Still on for tonight?'), 'each text has its time and who wrote it');
ok(/not just now/.test(block), 'the AI is told they are not new');
ok(block.indexOf('brutal') < block.indexOf('Still on'), 'oldest first');

ok(T.textLines(g, w, [mia]).length === 1, 'one block per person here');
ok(T.textLines(g, w, [{ ...mia, met: false }]).length === 0, 'nobody you have not met');
ok(!T.textLines(g, w, [mia]).join('\n').includes('Helena only'), 'only the people in the scene');
ok(T.textLines(g, w, [{ avatar: 'ex7.png', name: 'Nobody', met: true }]).length === 0, 'no texts, no block');

g.social.threads['ex0.png'] = Array.from({ length: 400 }, (_, i) => ({ me: i % 2 === 0, text: `message number ${i} with some words in it to take room`, at: now - 400 + i }));
const big = T.textBlockFor(g, w, mia);
ok(Math.ceil(big.length / 3.6) <= T.TEXT_TOKENS, 'a long thread stays under 1500 tokens');
ok(big.includes('message number 399') && !big.includes('message number 0 '), 'the newest are kept');
ok(/\(\d+ earlier texts from these days not shown\.\)/.test(big), 'and the AI is told some were left out');

ok(P.BLOCKS.some(b => b.id === 'texts' && b.cut), 'Texts is a block in AI context, dropped by the budget like the others');

g.social.threads = { 'ex0.png': [
    { me: true, text: 'Morning!', at: g.day * 1440 + 8 * 60 },
    { me: false, text: 'Hey you', at: g.day * 1440 + 8 * 60 + 5 },
    { me: true, text: 'Yesterday', at: (g.day - 1) * 1440 + 8 * 60 },
] };
const d = T.diaryTexts(g, g.day, 'Alex');
ok(d.includes(`08:00 Alex → ${mia.name}: Morning!`) && d.includes(`08:05 ${mia.name} → Alex: Hey you`), 'the day\'s texts go to the diary, with who wrote to whom');
ok(!d.includes('Yesterday'), 'only that day');
ok(T.diaryTexts(g, g.day - 5, 'Alex') === '', 'a day without texts adds nothing');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
