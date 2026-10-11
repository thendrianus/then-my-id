import { type CollectionEntry, getCollection, getEntry } from 'astro:content';
import type { PlayerItem } from './player/types';

export type Post = CollectionEntry<'posts'>;
export type Hymn = CollectionEntry<'hymns'>;
export type Category = CollectionEntry<'categories'>;

/** All background sounds, by id. Loaded once; used to attach a note's backsound to its player item. */
const backsoundsById = new Map((await getCollection('backsounds')).map((b) => [b.id, b.data]));

export const FORMAT_LABELS: Record<Post['data']['format'], string> = {
  article: 'Article',
  video: 'Video',
  book: 'Book',
  podcast: 'Podcast',
  talk: 'Talk',
  paper: 'Paper',
};

/** Published posts, newest first. Drafts show up in `npm run dev` only. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getHymns(): Promise<Hymn[]> {
  const hymns = await getCollection('hymns', (h) => import.meta.env.DEV || !h.data.draft);
  return hymns.sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export async function getCategories(): Promise<Category[]> {
  const categories = await getCollection('categories');
  return categories.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every tag with the posts that use it, most-used first. */
export function collectTags(posts: Post[]) {
  const map = new Map<string, { name: string; slug: string; posts: Post[] }>();
  for (const post of posts) {
    for (const name of post.data.tags) {
      const slug = slugify(name);
      if (!map.has(slug)) map.set(slug, { name, slug, posts: [] });
      map.get(slug)!.posts.push(post);
    }
  }
  return [...map.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
}

export function postsInCategory(posts: Post[], categoryId: string): Post[] {
  return posts.filter((p) => p.data.categories.some((c) => c.id === categoryId));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function postToItem(post: Post): PlayerItem {
  const { title, source, format, lang } = post.data;
  const by = source?.author ? ` · ${source.author}` : '';
  const bs = post.data.backsound && backsoundsById.get(post.data.backsound.id);
  return {
    key: `post:${post.id}`,
    kind: 'post',
    title,
    subtitle: `${FORMAT_LABELS[format]} summary${by}`,
    href: `/blog/${post.id}/`,
    speech: `/speech/${post.id}.txt`,
    lang,
    backsound: bs ? { id: post.data.backsound!.id, name: bs.name, src: bs.audio, volume: bs.volume } : undefined,
  };
}

export function hymnToItem(hymn: Hymn): PlayerItem {
  const { title, performer, lyricist, composer, audio, youtube, lang } = hymn.data;
  return {
    key: `hymn:${hymn.id}`,
    kind: 'hymn',
    title,
    subtitle: performer ?? lyricist ?? composer ?? 'Song',
    href: `/hymns/${hymn.id}/`,
    audio,
    youtube: audio ? undefined : youtube,
    lang,
  };
}

/** A song has something to read aloud when its Markdown body (lyrics, story…) isn't empty. */
export function hymnHasText(hymn: Hymn): boolean {
  return (hymn.body ?? '').trim().length > 0;
}

/**
 * The "read the lyrics and story aloud" item for a song. It's a read-aloud item (kind "post"),
 * so the player uses the speech voice, not the recording.
 */
export function hymnToTextItem(hymn: Hymn): PlayerItem {
  const { title, lyricist, lang } = hymn.data;
  return {
    key: `hymn-text:${hymn.id}`,
    kind: 'post',
    title: `${title}: lyrics and story`,
    subtitle: lyricist ?? 'Song',
    href: `/hymns/${hymn.id}/`,
    speech: `/speech/songs/${hymn.id}.txt`,
    lang,
  };
}

/** Resolve a playlist's references into the actual posts and hymns, in order. */
export async function resolvePlaylist(playlist: CollectionEntry<'playlists'>) {
  const entries = await Promise.all(
    playlist.data.items.map(async (ref) => {
      if ('post' in ref) {
        const post = await getEntry(ref.post);
        return post && (import.meta.env.DEV || !post.data.draft) ? { kind: 'post' as const, entry: post } : undefined;
      }
      const hymn = await getEntry(ref.hymn);
      return hymn && (import.meta.env.DEV || !hymn.data.draft) ? { kind: 'hymn' as const, entry: hymn } : undefined;
    }),
  );
  return entries.filter((e) => e !== undefined);
}
