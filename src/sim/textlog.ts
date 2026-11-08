import { nowAbs, type Save } from '../core/store.js';
import { messageKind, type WorldDef } from '../core/world.js';
import { social } from './social.js';
import { weekday, hm, period } from './time.js';

export const TEXT_DAYS = 3;
export const TEXT_TOKENS = 1500;
const TEXT_CHARS = 400;

const estTokens = (t: string) => Math.ceil(t.length / 3.6);
const oneLine = (t: string, max = TEXT_CHARS) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };

export function ago(mins: number): string {
    if (mins < 2) return 'just before now';
    if (mins < 60) return `about ${mins} minutes ago`;
    if (mins < 1440) { const h = Math.round(mins / 60); return h === 1 ? 'about an hour ago' : `about ${h} hours ago`; }
    const d = Math.round(mins / 1440); return d === 1 ? 'about a day ago' : `about ${d} days ago`;
}

export function whenLabel(g: Save, w: WorldDef, at: number): string {
    const day = Math.floor(at / 1440), min = at - day * 1440;
    const part = period(w, min).name.toLowerCase();
    const diff = g.day - day;
    const dayWord = diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${weekday(day)} (${diff} days ago)`;
    return `${dayWord}, ${part}`;
}

export interface TextLine { me: boolean; text: string; at: number }

export function recentTexts(g: Save, avatar: string, days = TEXT_DAYS): TextLine[] {
    const now = nowAbs(g);
    return (social(g).threads[avatar] ?? []).filter(t => t && typeof t.at === 'number' && t.at <= now && now - t.at <= days * 1440 && String(t.text ?? '').trim());
}

export function textBlockFor(g: Save, w: WorldDef, r: { avatar: string; name: string }, budget = TEXT_TOKENS): string {
    const list = recentTexts(g, r.avatar);
    if (!list.length) return '';
    const letters = messageKind(w) === 'letters';
    const now = nowAbs(g);
    const what = letters ? 'letters' : 'texts';
    const head = `Recent ${what} between {{user}} and ${r.name} (last ${TEXT_DAYS} days, ${letters ? 'carried by courier' : 'by phone'} while they were apart; now is ${hm(g.minutes)} today). These were ${letters ? 'written' : 'sent'} at the times shown, not just now: treat them as things already said earlier, never as a message that just arrived, and let how long ago they were shape how they are brought up (if at all).`;
    const build = (from: number) => {
        const out: string[] = [];
        let group = '';
        for (const t of list.slice(from)) {
            const label = whenLabel(g, w, t.at);
            if (label !== group) { group = label; out.push(`${label} — ${ago(now - t.at)}:`); }
            out.push(`${hm(t.at % 1440)} ${t.me ? '{{user}}' : r.name}: ${oneLine(t.text)}`);
        }
        return out;
    };
    const skippedLine = (n: number) => (n ? [`(${n} earlier ${what} from these days not shown.)`] : []);
    const full = (n: number) => [head, ...skippedLine(n), ...build(n)].join('\n');
    let from = 0;
    let out = full(from);
    while (from < list.length - 1 && estTokens(out) > budget) out = full(++from);
    return out;
}

export function textLines(g: Save, w: WorldDef, present: { avatar: string; name: string; met?: boolean }[]): string[] {
    return present.filter(r => r.met).map(r => textBlockFor(g, w, r)).filter(Boolean);
}

export function diaryTexts(g: Save, day: number, me: string, maxChars = 5000): string {
    const out: { at: number; line: string }[] = [];
    for (const [avatar, thread] of Object.entries(social(g).threads ?? {})) {
        const name = g.cast[avatar]?.name; if (!name) continue;
        const today = (thread ?? []).filter(t => t && typeof t.at === 'number' && Math.floor(t.at / 1440) === day && String(t.text ?? '').trim());
        for (const t of today) out.push({ at: t.at, line: `${hm(t.at % 1440)} ${t.me ? `${me} → ${name}` : `${name} → ${me}`}: ${oneLine(t.text, 240)}` });
    }
    const lines = out.sort((a, b) => a.at - b.at).map(x => x.line);
    let text = lines.join('\n');
    while (text.length > maxChars && lines.length > 1) { lines.shift(); text = lines.join('\n'); }
    return text;
}
