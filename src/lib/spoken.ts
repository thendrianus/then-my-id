import { remark } from 'remark';
import strip from 'strip-markdown';

/** Make sure a line ends with punctuation, so voices finish it with a natural falling tone. */
export const sentence = (s: string) => (/[.!?…:;"”’)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** "Luke 22:19" or "Isaiah 53:6-7": voices tend to read these like clock times, so spell them out. */
const SCRIPTURE = /\b((?:[1-3] )?[A-Z][a-z]+) (\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?\b/g;
const SAY_SCRIPTURE: Record<string, (book: string, ch: string, v1: string, v2?: string) => string> = {
  en: (book, ch, v1, v2) => `${book} chapter ${ch}, verse${v2 ? 's' : ''} ${v1}${v2 ? ` to ${v2}` : ''}`,
  id: (book, ch, v1, v2) => `${book} pasal ${ch} ayat ${v1}${v2 ? ` sampai ${v2}` : ''}`,
};

/** Markdown to plain text for speech: no symbols, no escapes, scripture references spelled out. */
export async function plainText(markdown: string, lang = 'en'): Promise<string> {
  const say = SAY_SCRIPTURE[lang.slice(0, 2)];
  const text = String(await remark().use(strip).process(markdown))
    // remark escapes Markdown characters (e.g. `1\.` in a heading); speech wants plain text.
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
  return say ? text.replace(SCRIPTURE, (_, book, ch, v1, v2) => say(book, ch, v1, v2)) : text;
}

/** Plain text with a full stop at the end of every non-empty line (headings, list items…). */
export async function spokenLines(markdown: string, lang = 'en'): Promise<string> {
  return (await plainText(markdown, lang))
    .split('\n')
    .map((line) => (line.trim() ? sentence(line) : line))
    .join('\n');
}
