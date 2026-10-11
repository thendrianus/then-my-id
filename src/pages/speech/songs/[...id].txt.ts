import type { APIRoute, GetStaticPaths } from 'astro';
import { getHymns, type Hymn, hymnHasText } from '../../../lib/content';
import { sentence, spokenLines } from '../../../lib/spoken';

/**
 * What the player reads aloud for a song's "Read lyrics & story" button: the title, the lyrics
 * verse by verse, then the story and the author section. Served at /speech/songs/<song-id>.txt
 */
export const getStaticPaths = (async () => {
  const hymns = (await getHymns()).filter(hymnHasText);
  return hymns.map((hymn) => ({ params: { id: hymn.id }, props: { hymn } }));
}) satisfies GetStaticPaths;

const WORDS_BY = { en: 'Words by', id: 'Syair oleh' } as const;
const THE_LYRICS = { en: 'The lyrics.', id: 'Liriknya.' } as const;
const VERSE = { en: 'Verse', id: 'Bait' } as const;

export const GET: APIRoute = async ({ props }) => {
  const { hymn } = props as { hymn: Hymn };
  const { title, lyricist } = hymn.data;
  const lang = hymn.data.lang.startsWith('id') ? 'id' : hymn.data.lang.startsWith('en') ? 'en' : null;

  // The body is the lyrics, optionally followed by a <section class="song-notes"> with the story and bio.
  const [lyricsPart, ...rest] = (hymn.body ?? '').split('<section class="song-notes">');
  const notesPart = rest
    .join('\n')
    .replace(/<\/section>/g, '')
    .replace(/<p class="sources">[\s\S]*?<\/p>/g, '');

  // Lyrics: a numbered verse becomes "Verse N." and its lines are joined into one flowing paragraph.
  let verses = 0;
  const lyrics: string[] = [];
  for (const block of lyricsPart.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    if (/^\d+\.\s/.test(block)) {
      verses++;
      const text = block.replace(/^\d+\.\s*/, '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
      lyrics.push(lang ? `${VERSE[lang]} ${verses}.` : '', sentence(text));
    } else {
      lyrics.push(await spokenLines(block, hymn.data.lang));
    }
  }

  const text = [
    sentence(title),
    lang && lyricist ? `${WORDS_BY[lang]} ${lyricist}.` : '',
    lyrics.length && lang ? THE_LYRICS[lang] : '',
    ...lyrics,
    notesPart.trim() ? await spokenLines(notesPart, hymn.data.lang) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
