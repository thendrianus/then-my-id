export type PlayerKind = 'post' | 'hymn';

/** Everything the player needs to play one thing, without visiting its page. */
export interface PlayerItem {
  /** Unique id, e.g. "post:deep-work" or "hymn:amazing-grace". */
  key: string;
  kind: PlayerKind;
  title: string;
  subtitle?: string;
  href: string;
  /** Audio file URL (hymns). */
  audio?: string;
  /** YouTube video id (hymns without an audio file). */
  youtube?: string;
  /** URL of the plain text to read aloud (posts). */
  speech?: string;
  lang?: string;
  /** Quiet looping sound under a read-aloud note. */
  backsound?: Backsound;
}

export interface Backsound {
  id: string;
  name: string;
  src: string;
  /** 0–1, before the listener's own background-volume setting. */
  volume: number;
}

export interface Progress {
  current: number;
  total: number;
  /** Audio and video move in seconds; read-aloud moves sentence by sentence. */
  unit: 'seconds' | 'sentences';
  /** The sentence being read right now. */
  caption?: string;
  /** Rough seconds left, for read-aloud. */
  remaining?: number;
}

export interface DriverEvents {
  progress(p: Progress): void;
  playing(isPlaying: boolean): void;
  ended(): void;
  error(message: string): void;
  /** Read-aloud only: speech has actually become audible (true) or gone quiet on purpose (false). */
  sounding?(isSounding: boolean): void;
}

/** One way of producing sound: audio file, YouTube, or speech synthesis. */
export interface Driver {
  /** Prepare an item without starting playback. */
  load(item: PlayerItem, startAt: number): Promise<void>;
  play(): void;
  pause(): void;
  /** Unload and go silent; no more events until the next load. */
  stop(): void;
  seek(position: number): void;
  /** Jump a little: ±10 seconds, or ±1 sentence. */
  skip(direction: 1 | -1): void;
  setRate(rate: number): void;
}
