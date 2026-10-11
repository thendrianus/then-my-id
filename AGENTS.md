# AGENTS.md

Instructions for AI agents (Claude Code and others) working on this repo: **then.my.id**, a personal
site built with Astro 7 and deployed on Vercel. The owner mostly asks for two things: **add a note**
(a summary of something they read or watched) and **add a song** (a hymn or music with lyrics and a
recording). Everything is Markdown and YAML in `src/content/`. There is no database and no CMS.

Every note can be read aloud and every song can be played, so content is written to be *heard*.

## Commands

```bash
npm install
npm run dev       # http://localhost:4321 (drafts are visible in dev only)
npm run check     # type-check content + code; must show 0 errors
npm run build     # production build; validates ALL content against the schemas
```

Always run `npm run check && npm run build` after changing content. A bad category, backsound key,
or hymn without audio **fails the build**, which is intended.

If `npm run dev` shows stale content or a "collection does not exist" warning after you add a new
collection or YAML key, stop the dev server, delete `.astro/data-store.json`, and restart.

## Ground rules

- **Ask for what's missing; never invent facts.** Titles, authors, URLs, years, YouTube IDs, licences
  and ratings must come from the user or be verified. If the user gives only a link or a title, look
  it up (or ask). Don't guess a source URL.
- **Write in the user's own voice, in your own words.** A note is the owner's summary, in first-person
  where it says "I", never a copy of the source. Do not paste long passages. If quoting, keep it to a
  short well-known line.
- **Only commit what a public repo may contain.** The repo is public (see Copyright below).
- **Don't change the schemas, layouts or player** just to add content. If something doesn't fit, tell
  the user instead of reshaping the code.
- Don't commit or push unless asked.

## Adding a note

File: `src/content/posts/<url-name>.md` → page at `/blog/<url-name>/`.

`<url-name>`: lowercase, hyphens, no spaces, short, unique (e.g. `how-to-do-great-work`).
Indonesian notes can end in `-ringkasan`.

### Frontmatter

```yaml
---
title: How to Do Great Work              # required. Often the title of the original.
summary: One or two spoken sentences.    # required. Shown on cards; READ ALOUD right after the title.
date: 2026-09-28                         # required. YYYY-MM-DD, the day it was written/finished.
format: article                          # article | video | book | podcast | talk | paper (default: article)
categories: [work, learning]             # required, at least 1. Keys from src/content/categories.yaml.
tags: [paul graham, curiosity]           # optional, free-form, lowercase. 2–5 is plenty.
source:                                  # include whenever there is an original
  title: How to Do Great Work
  author: Paul Graham
  url: https://paulgraham.com/greatwork.html
youtube: UF8uR6Z6KLc                     # optional: video ID; embeds the video on the page
rating: 5                                # optional: integer 1–5 (how much the owner recommends it)
backsound: calm                          # optional: key from src/content/backsounds.yaml
lang: en                                 # en (default) or id; picks the read-aloud voice and intro
draft: false                             # true = visible in `npm run dev` only
---
```

Rules:

- **Categories must already exist** in [`src/content/categories.yaml`](src/content/categories.yaml).
  The first category is the "main" one (used for older/newer links on the note page). If none fits,
  **ask the user** before adding a new category. To add one, append to the YAML:
  `key: { name: ..., description: ... }`. Keep keys lowercase with no spaces.
- **`updated:`** (optional date) is for later revisions; don't add it to new notes.
- `format: video` or `talk` with a YouTube link: put the ID in `youtube:` (the part after `v=`).
  Verify it exists:
  `curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"`
  returns JSON with the title if it's real.
- `source.author` for a YouTube video is the speaker or the person who made it, not the channel
  (unless the channel is the author).
- **Choosing a backsound** (optional but nice): pick one that matches the mood, from
  [`src/content/backsounds.yaml`](src/content/backsounds.yaml): `rain` (reflective), `ocean` (calm),
  `stream` (gentle), `birds` (light, morning), `spiritual` and `calm` (soft piano). Leave it out
  for dense or emotional material where silence suits better. A key not in the file fails the build.
- **Indonesian notes**: set `lang: id`; write the whole note (title, summary, body) in Indonesian.
  The player then uses an Indonesian voice and says "Ringkasan buku … karya …".

### Writing the body (this is the important part)

The body is read aloud by a text-to-speech voice, so write it the way a person would *say* it.
Follow the shape of the existing notes in `src/content/posts/` (see `example-note.md`).

**Structure**

1. Start with a short section that says where the thing came from or why it matters.
2. Then 2–4 sections for the main ideas, in the order the original presents them.
3. End with a section on what the owner takes away ("What I want to remember", "What I am taking
   away", "Yang akan saya coba"). Write this in first person, as a short paragraph.

**Style**

- **One idea per paragraph**, and start each paragraph with its point. The player pauses a little
  longer between paragraphs, so they work like breaths.
- **Short, plain sentences.** About 8–25 words. No nested clauses, no long asides.
- **Signpost** for the listener: "There are three ideas here. The first is…", "From there, he turns
  to…", "The second story is about…". Use ordinals in words, not "1." or "(a)".
- **No bullet or numbered lists.** They sound choppy. Turn them into sentences ("First… Second… And
  third…").
- **No tables, code blocks, footnotes, or links in the body.** The source link goes in `source.url`.
- **Headings** use `##` only, as short noun phrases ("The first story: connecting the dots"). Headings
  are read aloud. Don't repeat the note's title as a heading. Don't skip to `###` unless needed.
- **Avoid symbols and shorthand the voice will mangle**: `&`, `/`, `%`, `->`, `e.g.`, `i.e.`, `vs.`,
  brackets, emoji, and long strings of digits. Write "and", "percent", "for example". Write numbers
  as you'd say them ("fifteen minutes", "June 2005"). Spell out abbreviations on first use.
- Italics for a title or emphasis are fine (`*Mere Christianity*`); the formatting is stripped
  when read. Don't use bold for whole sentences.
- **Length:** about 300–500 words (2–4 minutes spoken). Longer is fine only if the source is long.
- Don't repeat the `summary` in the first paragraph. The summary is read first, so the body begins
  with new information.
- Keep the owner's voice honest: summarise what the source *says*; mark the owner's own opinions
  clearly ("I think…", "What stays with me is…"). Don't invent opinions the user didn't give. If they
  gave none, keep the last section a neutral "key takeaways" paragraph and tell them it's a draft they
  can personalise.

**Summary field**: one or two sentences, 20–40 words, no markdown. It is read right after the title
and intro, so it should stand alone. Don't start it with "This note…".

### Check what will be spoken

After building, open `http://localhost:4321/speech/<url-name>.txt` (dev) or `dist/speech/<url-name>.txt`
to read exactly what the voice will say. Look for stray symbols, awkward fragments, and
sentences that run on.

## Adding a song (hymn or music)

File: `src/content/hymns/<url-name>.md` → page at `/hymns/<url-name>/`, shown to visitors as **Songs**.
(The folder and URLs say "hymns", but the site label is "Songs". Don't rename them unless asked.)

### Frontmatter

```yaml
---
title: Amazing Grace                         # required
lyricist: John Newton                        # optional ("Words" on the page)
composer: Traditional American melody        # optional ("Music")
tune: New Britain                            # optional
year: 1779                                   # optional integer: when the song was written
performer: United States Air Force Reserve Band   # optional: who plays/sings THIS recording
audio: https://…/file.mp3                    # EITHER audio …
youtube: abc123XYZ                           # … OR a YouTube video ID (at least one is required)
credit: US Air Force Reserve Band, public domain, via Wikimedia Commons
creditUrl: https://commons.wikimedia.org/wiki/File:…
tags: [Grace, Assurance]                     # optional themes; each becomes a section on /hymns/
lang: en                                     # en (default) or id
added: 2026-09-01                            # required. YYYY-MM-DD, the day it was added
---

1. First verse…
```

Rules:

- **A song must have `audio` or `youtube`**, or the build fails. If both are set, `audio` wins.
- `audio` is either a file in `public/audio/` referenced as `/audio/<name>.mp3` (preferred: MP3, under
  about 20 MB, since GitHub rejects files over 100 MB), or a direct `https://` URL to an audio file.
  Prefer **MP3**, since Safari can't play `.ogg`. For Wikimedia Commons `.ogg`/`.wav` files, use the
  auto-generated MP3 under `.../transcoded/.../<file>.mp3`.
- Verify an audio URL works before adding it:
  `curl -sI -A "then-my-id" "<url>" | head -5` → should be `200` with an `audio/*` content type.
  (Wikimedia rate-limits fast requests; wait a few seconds between calls.)
- `youtube`: verify the ID with the oembed check above. Not every video allows embedding: if
  the player reports "owner does not allow this video to be embedded", pick another upload.
- **`credit` + `creditUrl` are required for any recording that isn't the owner's own** (and mandatory
  for CC BY / CC BY-SA). They show on the song page and on `/credits/`. For a YouTube video, put the
  channel in `performer` and the video's own URL in `creditUrl`.
- `tags` are themes (Grace, Morning, Worship, Advent…). Reuse existing tags where they fit; run
  `grep -h "^tags:" src/content/hymns/*.md` to see them. Capitalise the first letter.
- Don't set `lang: id` unless the lyrics are in Indonesian.

### Lyrics (body)

- Write verses as a **numbered Markdown list**. Each verse is one list item and each line within it ends
  with a newline plus **three spaces** of indentation:

  ```markdown
  1. Amazing grace! how sweet the sound
     That saved a wretch like me!
     I once was lost, but now am found,
     Was blind, but now I see.

  2. 'Twas grace that taught my heart to fear,
     …
  ```

- For a chorus, add a heading line `## Chorus` (it renders as a small label) and put the chorus text
  below it as a normal paragraph. Don't repeat the chorus after every verse; write it once.
- No notes, chords or commentary in the lyrics; keep them clean.

### Copyright (important: the repo is public)

- **Only add lyrics that are public domain or that the owner wrote/has permission for.** Hymns published
  before about 1930 are generally public domain (e.g. Amazing Grace, Holy Holy Holy, Be Thou My
  Vision). **Modern worship songs and most contemporary lyrics are copyrighted. Don't paste them.**
  For those, leave the body empty (or add a one-line note such as "Lyrics are under copyright; see the
  publisher") and link to the official source in `credit`/`creditUrl`.
- Translations and arrangements can have their own copyright; check before using a modern translation
  of an old hymn.
- **Recordings:** only commit/link audio that is public domain, CC-licensed (with credit), or owned by
  the user. Never download or commit a commercial recording (Spotify, Apple Music, a label's MP3, a
  YouTube rip). For popular recordings use `youtube:` pointing at the *official* or a licensed upload.
- Good sources for free recordings: Wikimedia Commons, Musopen, the Internet Archive, the Free Music
  Archive. Record the licence in `credit`.
- If unsure about the status of either lyrics or audio, **ask the user** and say what you found.

## Playlists, categories, backsounds

- **Playlists** (`src/content/playlists/<name>.md`): optional; only when asked. Mix notes and songs:

  ```yaml
  ---
  title: Sunday Morning
  description: One sentence shown on cards.
  items:
    - hymn: amazing-grace         # file name (without .md) in src/content/hymns/
    - post: example-note          # file name (without .md) in src/content/posts/
  ---
  Optional intro text.
  ```
  Items must reference files that exist, or the build fails. Draft notes are skipped in production.
- **Categories**: `src/content/categories.yaml`. Ask before adding. Key format: lowercase, no spaces.
- **Backsounds**: `src/content/backsounds.yaml`. Each needs `name`, `audio` (a URL or
  `/audio/backsounds/<file>.mp3`), `volume` (0 to 1; 0.1–0.3 is typical so it sits *under* the voice) and a
  `credit` (+`creditUrl`) unless it's the owner's own. Only add sounds that are free to use. Ambient piano
  and nature sounds work best; avoid anything with vocals or a strong beat.

## Workflow when asked to add content

1. **Collect the inputs**: for a note, the source (link/title/author), format, the owner's own
   thoughts or rating, and the category. For a song, the title, who wrote it, where the recording comes
   from, and the licence. Ask only for what you can't find yourself.
2. **Fetch and verify** the source, YouTube ID, or audio URL. Don't guess.
3. **Write the file** following the rules above, using an existing file as the pattern.
4. **Run** `npm run check && npm run build`. Fix every error.
5. **Check the spoken text** for notes (`dist/speech/<name>.txt`).
6. If the dev server is running, open the new page and (for songs) press play to confirm the audio loads.
7. **Report** what you added, the file path, anything you assumed or couldn't verify, and any licence
   or credit the owner should know about. Don't commit or push unless asked.

## Project map (for non-content changes)

| Path | What it is |
|---|---|
| `src/content/{posts,hymns,playlists}/` | Content (Markdown) |
| `src/content/{categories,backsounds}.yaml` | Shared lists that notes refer to by key |
| `src/content.config.ts` | Schemas for all content (the source of truth for frontmatter) |
| `src/lib/content.ts` | Helpers that turn notes/songs into player items |
| `src/lib/player/` | The player: `engine.ts` (queue), `audio.ts`, `youtube.ts`, `speech.ts`, `backsound.ts`, `ui.ts` |
| `src/pages/speech/[...id].txt.ts` | Builds the plain text the voice reads for each note |
| `src/components/Player.astro` | The player bar (persists across pages via `transition:persist`) |
| `src/styles/global.css` | All styling |
| `src/consts.ts` | Site title, description, optional `REPO_URL` for the footer |

The player is mounted once and survives page navigation (Astro's client router); don't move it out of
`Base.astro` or remove `transition:persist` or music will stop on every click.
Speech runs in the browser (Web Speech API). It can't be tested in the Claude desktop app's built-in
browser panel (its speech engine never starts), so test reading in Chrome or Safari.

See [README.md](README.md) for the human-facing version of these instructions and for deployment.
