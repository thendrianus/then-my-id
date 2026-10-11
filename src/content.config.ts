import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Categories live in one file so every post must use a category that exists.
 * A typo in a post's `categories` fails the build instead of creating a stray category.
 */
const categories = defineCollection({
  loader: file('./src/content/categories.yaml'),
  schema: z.object({
    name: z.string(),
    description: z.string(),
  }),
});

/**
 * Background sounds that can play quietly under a note while it's read aloud.
 * Defined in one file; a note picks one with `backsound: <key>`.
 */
const backsounds = defineCollection({
  loader: file('./src/content/backsounds.yaml'),
  schema: z.object({
    name: z.string(),
    /** Audio file: a path under /public (e.g. "/audio/backsounds/rain.mp3") or a full URL. Loops. */
    audio: z.string(),
    /** How loud under the voice, 0–1. Around 0.15–0.3 works for most sounds. */
    volume: z.number().min(0).max(1).default(0.2),
    credit: z.string().optional(),
    creditUrl: z.url().optional(),
  }),
});

/** Summaries of things I read or watched. */
const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    /** One or two sentences: shown on cards and read first by the player. */
    summary: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    /** What kind of thing the original was. */
    format: z.enum(['article', 'video', 'book', 'podcast', 'talk', 'paper']).default('article'),
    categories: z.array(reference('categories')).min(1),
    tags: z.array(z.string()).default([]),
    source: z
      .object({
        title: z.string().optional(),
        author: z.string().optional(),
        url: z.url().optional(),
      })
      .optional(),
    /** YouTube video id, if the original is a YouTube video: it is embedded on the page. */
    youtube: z.string().optional(),
    /** How much I'd recommend it, 1–5. */
    rating: z.number().int().min(1).max(5).optional(),
    /** Background sound while this note is read aloud: a key from backsounds.yaml. */
    backsound: reference('backsounds').optional(),
    /** Language of the summary; picks the read-aloud voice. e.g. "en", "id". */
    lang: z.string().default('en'),
    draft: z.boolean().default(false),
  }),
});

/** Hymns and music. The Markdown body holds the lyrics. */
const hymns = defineCollection({
  loader: glob({ base: './src/content/hymns', pattern: '**/*.md' }),
  schema: z
    .object({
      title: z.string(),
      lyricist: z.string().optional(),
      composer: z.string().optional(),
      tune: z.string().optional(),
      year: z.number().int().optional(),
      performer: z.string().optional(),
      /** Audio file: a path under /public (e.g. "/audio/x.mp3") or a full URL. */
      audio: z.string().optional(),
      /** YouTube video id, used when there is no audio file. */
      youtube: z.string().optional(),
      /** Licence / attribution for the recording. */
      credit: z.string().optional(),
      creditUrl: z.url().optional(),
      tags: z.array(z.string()).default([]),
      lang: z.string().default('en'),
      added: z.coerce.date(),
    })
    .refine((h) => h.audio || h.youtube, {
      message: 'A hymn needs either `audio` or `youtube` so it can be played.',
    }),
});

/** Hand-made playlists that mix posts and hymns. */
const playlists = defineCollection({
  loader: glob({ base: './src/content/playlists', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    items: z
      .array(z.union([z.object({ post: reference('posts') }), z.object({ hymn: reference('hymns') })]))
      .min(1),
  }),
});

export const collections = { categories, backsounds, posts, hymns, playlists };
