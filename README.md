# then.my.id

My personal site: short notes on the articles, videos and books I read or watch, and the hymns I love.
Every note can be **read aloud** and every hymn can be **played**, and both go into one queue/playlist
that keeps playing while you move around the site.

Built with [Astro](https://astro.build), deployed on Vercel. No database, no server: everything is Markdown in this repo.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # production build into dist/
npm run check      # type-check content and code
```

## Writing

### A note (article, video, book…)

Create `src/content/posts/<url-name>.md`. The file name becomes the URL: `/blog/<url-name>/`.

```markdown
---
title: How to Do Great Work
summary: One or two sentences. Shown on cards, and read first by the player.
date: 2026-09-28
format: article            # article | video | book | podcast | talk | paper
categories: [work, learning]   # must exist in src/content/categories.yaml
tags: [paul graham, curiosity]  # free-form
source:
  title: How to Do Great Work
  author: Paul Graham
  url: https://paulgraham.com/greatwork.html
youtube: UF8uR6Z6KLc       # optional: embeds the video you watched
rating: 5                  # optional, 1–5
backsound: rain            # optional: background sound while read aloud (see below)
lang: en                   # en, id, … picks the read-aloud voice
draft: false               # true = only visible in `npm run dev`
---

Your summary in Markdown…
```

#### Writing for listening

Every note is also read aloud, so write it the way you would say it:

- **One idea per paragraph**, and start each paragraph with its point. The player pauses between paragraphs, so they work like breaths.
- **Short, plain sentences.** Avoid brackets, slashes, "e.g." and long asides. A listener can't glance back.
- **Signpost.** Say "There are three ideas here. The first is…" rather than using a bulleted list, which sounds choppy read aloud.
- **Headings are read too.** Keep them short phrases ("The second story: love and loss").
- **Write numbers and symbols as you'd say them**, such as "fifteen minutes" and "and" rather than "&".
- The player reads the title first, then "A summary of a book by …" from `source`, then `summary`, then the body.
  So `summary` should be one or two spoken sentences, and the body shouldn't repeat it.
- To hear what the player will read, open `/speech/<note>.txt` while running `npm run dev`.

### Categories

Categories are defined once in [`src/content/categories.yaml`](src/content/categories.yaml).
A note that uses a category that isn't there **fails the build**, so typos can't create stray categories.
Tags are free-form and get their own pages at `/tags/<tag>/`.

### Backsounds (background sound while a note is read aloud)

The list lives in [`src/content/backsounds.yaml`](src/content/backsounds.yaml). It starts with
`rain`, `ocean`, `stream`, `birds`, `spiritual` and `calm`. Pick one per note with `backsound: <key>`,
or leave it out for silence. A key that isn't in the list fails the build.

```yaml
rain:
  name: Light rain                 # shown in the player
  audio: /audio/backsounds/rain.mp3   # file in public/audio/backsounds/, or a URL; it loops
  volume: 0.3                      # 0–1, how loud under the voice
  credit: Who made it, licence     # needed for CC BY / CC BY-SA sounds; listed on /credits/
  creditUrl: https://…
```

It fades in and out with the voice and stops for hymns. Listeners can switch it off with the
waves button in the player, or change its volume in the queue panel. On iPhone and iPad, browsers
don't allow web pages to lower a sound's volume, so backsounds are skipped there rather than
drowning out the voice.

### A hymn

Create `src/content/hymns/<url-name>.md`. Lyrics go in the body (a numbered list = verses).

```markdown
---
title: Amazing Grace
lyricist: John Newton
composer: Traditional
tune: New Britain
year: 1779
performer: Who sings/plays this recording
audio: /audio/amazing-grace.mp3   # a file in public/audio/, or any https URL…
youtube: abc123XYZ                # …or a YouTube video id (used when there's no audio)
credit: Licence / attribution for the recording
creditUrl: https://…
tags: [Grace, Assurance]          # themes; each gets a section on /hymns/
added: 2026-09-01
---

1. Amazing grace! how sweet the sound
   That saved a wretch like me!
```

Audio files go in `public/audio/`. Keep them under ~20 MB each, since GitHub rejects files over 100 MB.
The repo is public, so only commit recordings you're allowed to share (public domain, your own,
or properly licensed). Otherwise use a YouTube id.

### A playlist

Create `src/content/playlists/<url-name>.md`. Mix notes and hymns in any order:

```markdown
---
title: Sunday Morning
description: Shown on cards.
items:
  - post: example-note
  - hymn: amazing-grace
---

Optional intro text.
```

### A challenge

Create `src/content/challenges/<url-name>.md`, then add a line to `log` each time you make progress:

```markdown
---
title: 100 Days of Intermittent Fasting
summary: A hundred days in a row, lunch only.
rule: Only lunch. No breakfast and no dinner.
target: 100
unit: days              # any unit: days, times, hours, km, pages…
schedule: daily         # daily (in a row), weekly (one entry per week) or flexible (any days, any amounts)
start: 2026-10-11
log:
  - 2026-10-11                          # one day = 1
  - 2026-10-12..2026-10-20              # a range of days, 1 each
  - { date: 2026-10-21, amount: 5, note: Optional note }
---
```

The page shows the total against the target, a calendar of done (and, for daily challenges, missed) days,
streaks, and the planned finish date.

## How the player works

- **Hymns** play through an `<audio>` element (files) or a small floating YouTube player (YouTube requires it to stay visible).
- **Notes** are read aloud with the browser's built-in speech synthesis, using the voice matching the note's `lang`.
  You can change the voice in the queue panel. The text comes from `/speech/<note>.txt`, generated at build time.
  Reading has its own speed (default 0.9×, from 0.6× to 1.5×), separate from the music speed. It also
  pauses briefly between sentences and a little longer between paragraphs.
- The site uses Astro's client router, so the player keeps going while you navigate. The queue, position and
  speed are saved in your browser, so a reload picks up where you left off.
- A song page has two groups, each with Play / Add to queue / Play next: **Song** (the recording) and
  **Lyrics & story** (the voice reads the lyrics verse by verse, then the story and author section).
- Any list (hymns, a playlist, a category) can be played from any row, and **Add to queue** / **Play next** work everywhere.
- Media keys and lock-screen controls work for audio and YouTube.

Code: `src/lib/player/`. `engine.ts` holds the queue, and `audio.ts`, `youtube.ts` and `speech.ts` do the actual playing.

## Deploying (GitHub + Vercel + then.my.id)

[`vercel.json`](vercel.json) is already set up (Astro, `npm run build` → `dist/`, trailing slashes, basic security
headers, caching for `public/audio/`). Nothing else needs configuring.

1. Create a new **public** repo on GitHub and push this folder to it:
   ```bash
   git init -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin git@github.com:<your-username>/<repo>.git
   git push -u origin main
   ```
2. On [vercel.com](https://vercel.com) → **Add New… → Project** → import that repo. Vercel detects Astro; keep the defaults
   and press **Deploy**. Every push to `main` now deploys automatically, and pull requests get preview URLs.
3. In the Vercel project → **Settings → Domains** → add `then.my.id`.
4. Vercel shows the DNS records to create. At the place where you manage `then.my.id`'s DNS, add them.
   Usually that's an **A** record for `@` and a **CNAME** for `www`. You can instead switch the domain's
   nameservers to Vercel's. DNS can take a few minutes to a few hours, and Vercel issues HTTPS automatically.
5. Optional: set `REPO_URL` in [`src/consts.ts`](src/consts.ts) to show a "Source" link in the footer.

The site URL (`site: 'https://then.my.id'` in `astro.config.mjs`) is used for the sitemap, RSS feed and canonical links.
Change it if you deploy under a different domain.
