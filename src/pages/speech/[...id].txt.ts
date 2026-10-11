import type { APIRoute, GetStaticPaths } from 'astro';
import { remark } from 'remark';
import strip from 'strip-markdown';
import { getPosts, type Post } from '../../lib/content';

/**
 * Plain-text version of each post, fetched by the player to read it aloud.
 * Served at /speech/<post-id>.txt
 */
export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

const sentence = (s: string) => (/[.!?…:;"”’)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const same = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "A summary of the book “X”, by Y." — or shorter when X is already the note's title. */
function introFor(post: Post): string {
  const { title, source, format, lang } = post.data;
  if (!source?.title && !source?.author) return '';
  const showTitle = source.title && !same(source.title, title);
  if (lang.startsWith('id')) {
    const kind = { article: 'artikel', video: 'video', book: 'buku', podcast: 'podcast', talk: 'ceramah', paper: 'makalah' }[format];
    return `Ringkasan ${kind}${showTitle ? ` “${source.title}”` : ''}${source.author ? ` karya ${source.author}` : ''}.`;
  }
  if (!lang.startsWith('en')) return '';
  if (showTitle) return `A summary of the ${format} “${source.title}”${source.author ? `, by ${source.author}` : ''}.`;
  const article = /^[aeiou]/.test(format) ? 'an' : 'a';
  return `A summary of ${article} ${format}${source.author ? ` by ${source.author}` : ''}.`;
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: Post };
  const { title, summary } = post.data;
  const body = String(await remark().use(strip).process(post.body ?? ''))
    // remark escapes Markdown characters (e.g. `1\.` in a heading); speech wants plain text.
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
    // Headings and list items have no full stop; give them one so voices end them naturally.
    .split('\n')
    .map((line) => (line.trim() ? sentence(line) : line))
    .join('\n');

  const text = [sentence(title), introFor(post), sentence(summary), body].filter(Boolean).join('\n\n');
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
