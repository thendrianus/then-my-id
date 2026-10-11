import type { Driver, DriverEvents, PlayerItem } from './types';

/** Characters per second at rate 1, for the "minutes left" estimate. */
const CHARS_PER_SECOND = 14.5;
/** Long utterances get cut off in some browsers, so no chunk is longer than this. */
const MAX_CHUNK = 220;
/** Silence between sentences, and the longer one after a paragraph or heading (ms at 1×). */
const SENTENCE_PAUSE = 250;
const PARAGRAPH_PAUSE = 700;
/** If a sentence hasn't started speaking by now, the voice is stuck. Online voices get longer. */
const STALL_MS = 4000;
const STALL_MS_ONLINE = 12000;
const STALL_MESSAGE =
  "Your browser didn't start reading aloud with any voice. Quit and reopen the browser (its speech engine sometimes gets stuck), then try again.";

/** Voices that failed to start during this visit; skipped when picking a voice. */
const brokenVoices = new Set<string>();

/** One piece of text to speak; `end` marks the last piece of a paragraph or heading. */
export interface Chunk {
  text: string;
  end: boolean;
}
const VOICE_KEY = 'then.voice.';

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);

export function speechSupported(): boolean {
  return !!synth() && typeof SpeechSynthesisUtterance !== 'undefined';
}

const baseLang = (lang: string) => lang.toLowerCase().split(/[-_]/)[0];

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Voices load asynchronously in most browsers; wait for them (briefly). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  voicesPromise ??= new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesPromise;
}

export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  const base = baseLang(lang);
  return (synth()?.getVoices() ?? []).filter((v) => baseLang(v.lang) === base);
}

export function savedVoiceName(lang: string): string | null {
  try {
    return localStorage.getItem(VOICE_KEY + baseLang(lang));
  } catch {
    return null;
  }
}

export function saveVoiceName(lang: string, name: string) {
  try {
    if (name) localStorage.setItem(VOICE_KEY + baseLang(lang), name);
    else localStorage.removeItem(VOICE_KEY + baseLang(lang));
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

/** The saved voice for this language, or the best-sounding one available. */
export function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = voicesFor(lang).filter((v) => !brokenVoices.has(v.name));
  const saved = savedVoiceName(lang);
  const chosen = saved && voices.find((v) => v.name === saved);
  if (chosen) return chosen;
  const score = (v: SpeechSynthesisVoice) =>
    // Installed voices start instantly and work offline; online ones (e.g. Chrome's
    // "Google …" voices) can be slow to start, stall, and tend to sound rushed.
    (v.localService ? 6 : 0) +
    (/natural|neural|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/siri|samantha|daniel|karen|moira|alex|damayanti/i.test(v.name) ? 2 : 0) +
    (v.lang.toLowerCase() === navigator.language.toLowerCase() ? 1 : 0) +
    (v.default ? 1 : 0) -
    (/compact|eloquence|novelty|bad news|bells|whisper|zarvox|albert|jester|organ|bubbles|cellos|trinoids|wobble|boing|superstar|bahh/i.test(v.name) ? 10 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/** A "sentence" that really ends in initials (C.S.) or an abbreviation (Dr., e.g.). */
const ABBREVIATION_END = /(?:^|[\s(])(?:[A-Z]\.){1,3}$|\b(?:Mr|Mrs|Ms|Dr|St|Prof|Sr|Jr|vs|etc|No|e\.g|i\.e)\.$/;

/** Break text into short, sentence-sized pieces that can be spoken one by one. */
export function splitForSpeech(text: string, lang = 'en'): Chunk[] {
  const Segmenter = (Intl as any).Segmenter;
  const segmenter = Segmenter ? new Segmenter(lang, { granularity: 'sentence' }) : null;
  const chunks: Chunk[] = [];
  const push = (pieces: string[]) => chunks.push(...pieces.map((t) => ({ text: t, end: false })));
  for (const block of text.split(/\n+/)) {
    const line = block.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const sentences: string[] = segmenter
      ? Array.from(segmenter.segment(line), (s: { segment: string }) => s.segment.trim())
      : (line.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) ?? [line]).map((s) => s.trim());
    let carry = '';
    for (const sentence of sentences) {
      if (!sentence) continue;
      // Fold fragments like "1.", initials like "C.S." and abbreviations like "Dr."
      // into the next sentence instead of reading them alone with a pause after.
      if (sentence.length <= 3 || ABBREVIATION_END.test(sentence)) {
        carry += `${sentence} `;
        continue;
      }
      push(splitLong(carry + sentence));
      carry = '';
    }
    if (carry.trim()) push([carry.trim()]);
    if (chunks.length) chunks[chunks.length - 1].end = true;
  }
  return chunks;
}

function splitLong(sentence: string): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_CHUNK) {
    const window = rest.slice(0, MAX_CHUNK);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    if (cut < MAX_CHUNK / 3) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = MAX_CHUNK;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Reads a post aloud with the browser's built-in speech synthesis. */
export class SpeechDriver implements Driver {
  private chunks: Chunk[] = [];
  private index = 0;
  private lang = 'en';
  private rate = 1;
  private playing = false;
  private active = false;
  /** Bumped whenever speech is cancelled, so callbacks from old utterances are ignored. */
  private generation = 0;
  /** Held so the browser doesn't garbage-collect it mid-sentence (which skips `onend`). */
  private utterance: SpeechSynthesisUtterance | null = null;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the current stall has already been retried once. */
  private retried = false;
  /** Voice of the sentence being spoken, so a stall can be blamed on it. */
  private voice: SpeechSynthesisVoice | undefined;
  /** Voices tried for the current stall; capped so a fully stuck engine fails fast. */
  private switches = 0;
  private cache = new Map<string, Chunk[]>();

  constructor(private events: DriverEvents) {}

  async load(item: PlayerItem, startAt: number) {
    if (!speechSupported()) throw new Error('This browser cannot read aloud.');
    if (!item.speech) throw new Error('Nothing to read for this item.');
    this.silence();
    this.active = true;
    this.lang = item.lang ?? 'en';
    let chunks = this.cache.get(item.speech);
    if (!chunks) {
      const res = await fetch(item.speech);
      if (!res.ok) throw new Error('Could not load the text to read.');
      chunks = splitForSpeech(await res.text(), this.lang);
      this.cache.set(item.speech, chunks);
    }
    await loadVoices();
    this.chunks = chunks;
    this.index = clamp(Math.floor(startAt), 0, chunks.length - 1);
    this.emitProgress();
  }

  play() {
    if (!this.active || !this.chunks.length) return;
    this.playing = true;
    this.events.playing(true);
    this.speakCurrent();
  }

  pause() {
    // pause()/resume() on speechSynthesis is unreliable across browsers,
    // so pausing cancels and play() restarts the current sentence.
    this.playing = false;
    this.silence();
    this.events.sounding?.(false);
    this.events.playing(false);
  }

  stop() {
    this.active = false;
    this.playing = false;
    this.silence();
    this.events.sounding?.(false);
  }

  seek(position: number) {
    this.index = clamp(Math.round(position), 0, this.chunks.length - 1);
    this.emitProgress();
    if (this.playing) this.speakCurrent();
  }

  skip(direction: 1 | -1) {
    this.seek(this.index + direction);
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.playing) this.speakCurrent();
    else this.emitProgress();
  }

  /** Re-read the current sentence, e.g. after the voice was changed. */
  refresh() {
    if (this.playing) this.speakCurrent();
  }

  private silence() {
    this.generation++;
    clearTimeout(this.startTimer);
    clearTimeout(this.stallTimer);
    synth()?.cancel();
    if (this.utterance) this.utterance.onend = this.utterance.onerror = null;
    this.utterance = null;
  }

  private speakCurrent(delay = 0) {
    this.silence();
    const generation = this.generation;
    const utterance = new SpeechSynthesisUtterance(this.chunks[this.index].text);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    const voice = pickVoice(this.lang);
    if (voice) utterance.voice = voice;
    this.voice = voice;
    utterance.onstart = () => {
      if (generation !== this.generation) return;
      clearTimeout(this.stallTimer);
      this.retried = false;
      this.switches = 0;
      this.events.sounding?.(true);
    };
    utterance.onend = () => {
      if (generation !== this.generation) return;
      clearTimeout(this.stallTimer);
      if (this.index < this.chunks.length - 1) {
        // Breathe between sentences, and a bit longer between paragraphs.
        const pause = (this.chunks[this.index].end ? PARAGRAPH_PAUSE : SENTENCE_PAUSE) / this.rate;
        this.index++;
        this.speakCurrent(pause);
      } else {
        this.playing = false;
        this.utterance = null;
        this.events.ended();
      }
    };
    utterance.onerror = (e) => {
      if (generation !== this.generation || e.error === 'interrupted' || e.error === 'canceled') return;
      clearTimeout(this.stallTimer);
      this.playing = false;
      this.events.sounding?.(false);
      this.events.playing(false);
      this.events.error(e.error === 'not-allowed' ? 'Press play to start reading.' : 'Reading aloud stopped unexpectedly.');
    };
    this.utterance = utterance;
    this.emitProgress();
    // Chrome sometimes drops an utterance queued in the same tick as cancel().
    this.startTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      synth()?.resume(); // un-sticks Chrome when its speech queue was left paused
      synth()?.speak(utterance);
      this.stallTimer = setTimeout(() => this.onStall(generation), voice && !voice.localService ? STALL_MS_ONLINE : STALL_MS);
    }, Math.max(60, delay));
  }

  /** Nothing was heard for a while: try another voice, then reset and retry once, then give up loudly. */
  private onStall(generation: number) {
    if (generation !== this.generation || !this.playing) return;
    const failed = this.voice;
    if (failed && this.switches < 2) {
      brokenVoices.add(failed.name);
      const next = pickVoice(this.lang);
      if (next && next.name !== failed.name) {
        this.switches++;
        console.warn(`[player] Voice "${failed.name}" didn't start; switching to "${next.name}".`);
        synth()?.cancel();
        this.speakCurrent();
        return;
      }
    }
    if (!this.retried) {
      this.retried = true;
      synth()?.cancel();
      this.speakCurrent();
      return;
    }
    this.retried = false;
    this.switches = 0;
    this.playing = false;
    this.silence();
    this.events.sounding?.(false);
    this.events.playing(false);
    this.events.error(STALL_MESSAGE);
  }

  private emitProgress() {
    const remainingChars = this.chunks.slice(this.index).reduce((n, c) => n + c.text.length, 0);
    this.events.progress({
      current: this.index,
      total: this.chunks.length,
      unit: 'sentences',
      caption: this.chunks[this.index]?.text,
      remaining: remainingChars / (CHARS_PER_SECOND * this.rate),
    });
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

let primed = false;

/** iPhone/iPad (iPadOS reports itself as a Mac, but with a touch screen). */
const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * iOS Safari only allows speech that starts inside a tap. Call this synchronously
 * from the click handler so the real (later, async) speech is allowed through.
 */
export function primeSpeech() {
  if (primed || !speechSupported() || !isIOS()) return;
  primed = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth()!.speak(u);
}
