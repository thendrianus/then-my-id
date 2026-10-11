import { AudioDriver } from './audio';
import { BacksoundMixer } from './backsound';
import { primeSpeech, SpeechDriver } from './speech';
import type { Driver, DriverEvents, PlayerItem, Progress } from './types';
import { YouTubeDriver } from './youtube';

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type Repeat = 'off' | 'all' | 'one';

export interface PlayerState {
  queue: PlayerItem[];
  index: number;
  status: Status;
  progress: Progress;
  /** Speed for hymns (audio / YouTube). */
  rate: number;
  /** Speed for read-aloud, kept separately: most voices sound rushed at their native 1×. */
  readingRate: number;
  /** Play a note's background sound while it's read aloud. */
  backsoundOn: boolean;
  /** Listener's background-sound volume, multiplies each sound's own volume (0–2). */
  backsoundLevel: number;
  repeat: Repeat;
  error?: string;
}

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const READING_RATES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
const DEFAULT_READING_RATE = 0.9;
const STORAGE_KEY = 'then.player.v1';
const EMPTY_PROGRESS: Progress = { current: 0, total: 0, unit: 'seconds' };

type DriverName = 'audio' | 'speech' | 'youtube';

const isSpeech = (item: PlayerItem | undefined) => !!item && !item.audio && !item.youtube;

const emptyProgressFor = (item: PlayerItem | undefined, current = 0): Progress => ({
  current,
  total: 0,
  unit: isSpeech(item) ? 'sentences' : 'seconds',
});
type Listener = (state: PlayerState) => void;

/**
 * One queue that can hold both posts (read aloud) and hymns (audio / YouTube).
 * The module is loaded once per visit and keeps running while you navigate.
 */
class PlayerEngine {
  state: PlayerState = {
    queue: [],
    index: 0,
    status: 'idle',
    progress: EMPTY_PROGRESS,
    rate: 1,
    readingRate: DEFAULT_READING_RATE,
    backsoundOn: true,
    backsoundLevel: 1,
    repeat: 'off',
  };

  private listeners = new Set<Listener>();
  private drivers: Partial<Record<DriverName, Driver>> = {};
  private driver: Driver | null = null;
  /** Key of the item currently loaded into `driver`. */
  private loadedKey: string | null = null;
  /** Bumped on every load so a slow, outdated load can't take over. */
  private loadToken = 0;
  private lastSaved = 0;
  private metadataKey: string | null = null;
  private backsound = new BacksoundMixer();
  /** Read-aloud is audible right now (not just "supposed to be playing"). */
  private speechSounding = false;

  constructor() {
    this.restore();
    this.setupMediaSession();
    window.addEventListener('pagehide', () => this.save(true));
  }

  get current(): PlayerItem | undefined {
    return this.state.queue[this.state.index];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  // ---- queue -------------------------------------------------------------

  /** Replace the queue and start playing. */
  playNow(items: PlayerItem[], startIndex = 0) {
    const queue = dedupe(items);
    if (!queue.length) return;
    this.prime(queue[startIndex]);
    this.unload();
    this.state.queue = queue;
    this.state.index = Math.min(startIndex, queue.length - 1);
    this.start(true, 0);
  }

  /**
   * Swap queued copies of these items for the versions on the current page, so
   * edits (a new title, an added backsound…) reach items queued before the edit.
   */
  refresh(items: PlayerItem[]) {
    let changed = false;
    this.state.queue = this.state.queue.map((q) => {
      const fresh = items.find((i) => i.key === q.key);
      if (!fresh || JSON.stringify(fresh) === JSON.stringify(q)) return q;
      changed = true;
      return fresh;
    });
    if (changed) this.emit();
  }

  /** Add to the end of the queue. Returns how many were actually added. */
  enqueue(items: PlayerItem[]): number {
    const fresh = items.filter((i) => !this.state.queue.some((q) => q.key === i.key));
    if (!fresh.length) return 0;
    const wasEmpty = !this.state.queue.length;
    this.state.queue = [...this.state.queue, ...dedupe(fresh)];
    if (wasEmpty) this.setState({ index: 0, status: 'paused', progress: emptyProgressFor(this.state.queue[0]) });
    else this.emit();
    return fresh.length;
  }

  /** Put items right after the current one. */
  playNext(items: PlayerItem[]): number {
    const fresh = dedupe(items).filter((i) => i.key !== this.current?.key);
    if (!fresh.length) return 0;
    const rest = this.state.queue.filter((q) => !fresh.some((f) => f.key === q.key));
    const at = rest.findIndex((q) => q.key === this.current?.key) + 1;
    rest.splice(at, 0, ...fresh);
    this.state.queue = rest;
    this.state.index = Math.max(0, at - 1);
    if (rest.length === fresh.length) this.state.status = 'paused';
    this.emit();
    return fresh.length;
  }

  jumpTo(index: number) {
    if (index < 0 || index >= this.state.queue.length) return;
    this.prime(this.state.queue[index]);
    this.unload();
    this.state.index = index;
    this.start(true, 0);
  }

  remove(index: number) {
    const { queue } = this.state;
    if (index < 0 || index >= queue.length) return;
    if (queue.length === 1) return this.clear();
    const removingCurrent = index === this.state.index;
    const wasPlaying = this.state.status === 'playing';
    queue.splice(index, 1);
    if (index < this.state.index) this.state.index--;
    this.state.index = Math.min(this.state.index, queue.length - 1);
    if (removingCurrent) {
      this.unload();
      if (wasPlaying) return this.start(true, 0);
      this.setState({ status: 'paused', progress: emptyProgressFor(this.current) });
    } else this.emit();
  }

  move(from: number, to: number) {
    const { queue } = this.state;
    if (to < 0 || to >= queue.length || from === to) return;
    const currentKey = this.current?.key;
    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item);
    this.state.index = Math.max(0, queue.findIndex((q) => q.key === currentKey));
    this.emit();
  }

  /** Shuffle everything after the current item. */
  shuffle() {
    const { queue, index } = this.state;
    const rest = queue.slice(index + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.state.queue = [...queue.slice(0, index + 1), ...rest];
    this.emit();
  }

  clear() {
    this.unload();
    this.setState({ queue: [], index: 0, status: 'idle', progress: EMPTY_PROGRESS, error: undefined });
  }

  // ---- transport ---------------------------------------------------------

  toggle() {
    const item = this.current;
    if (!item) return;
    if (this.state.status === 'playing' || this.state.status === 'loading') return this.pause();
    this.prime(item);
    if (this.driver && this.loadedKey === item.key) {
      this.driver.play();
      this.setState({ status: 'playing', error: undefined });
    } else {
      this.start(true, this.state.progress.current);
    }
  }

  pause() {
    this.driver?.pause();
    if (this.state.status === 'loading') this.loadToken++;
    this.setState({ status: 'paused' });
    this.save(true);
  }

  next() {
    const { index, queue, repeat } = this.state;
    if (index < queue.length - 1) this.jumpTo(index + 1);
    else if (repeat === 'all' && queue.length) this.jumpTo(0);
  }

  /** Restart the current item, or go back one if we're already near its start. */
  prev() {
    const { current, unit } = this.state.progress;
    const nearStart = unit === 'seconds' ? current < 3 : current < 1;
    if (!nearStart || this.state.index === 0) this.seek(0);
    else this.jumpTo(this.state.index - 1);
  }

  seek(position: number) {
    if (this.driver && this.loadedKey === this.current?.key) this.driver.seek(position);
    else this.setState({ progress: { ...this.state.progress, current: position } });
  }

  skip(direction: 1 | -1) {
    if (this.driver && this.loadedKey === this.current?.key) this.driver.skip(direction);
  }

  /** Change the speed for whatever is playing now: reading speed for notes, music speed for hymns. */
  setRate(rate: number) {
    if (isSpeech(this.current)) {
      this.state.readingRate = rate;
      this.drivers.speech?.setRate(rate);
    } else {
      this.state.rate = rate;
      this.drivers.audio?.setRate(rate);
      this.drivers.youtube?.setRate(rate);
    }
    this.emit();
    this.save(true);
  }

  cycleRate() {
    const reading = isSpeech(this.current);
    const rates = reading ? READING_RATES : RATES;
    const i = rates.indexOf(reading ? this.state.readingRate : this.state.rate);
    this.setRate(rates[(i + 1) % rates.length]);
  }

  cycleRepeat() {
    const order: Repeat[] = ['off', 'all', 'one'];
    this.setState({ repeat: order[(order.indexOf(this.state.repeat) + 1) % order.length] });
  }

  toggleBacksound() {
    const on = !this.state.backsoundOn;
    // Turning it back on after the slider was dragged to zero restores a normal level.
    this.setState({ backsoundOn: on, backsoundLevel: on && this.state.backsoundLevel === 0 ? 1 : this.state.backsoundLevel });
    this.save(true);
  }

  /** The volume slider: 0 means off. */
  setBacksoundLevel(level: number) {
    const clamped = Math.max(0, Math.min(2, level));
    this.setState({ backsoundLevel: clamped, backsoundOn: clamped > 0 });
    this.save(true);
  }

  /** Re-read the current sentence after the reading voice changed. */
  refreshVoice() {
    if (this.driver === this.drivers.speech) (this.driver as SpeechDriver).refresh();
  }

  // ---- internals ---------------------------------------------------------

  private async start(autoplay: boolean, startAt: number) {
    const item = this.current;
    if (!item) return;
    const token = ++this.loadToken;
    const driver = this.driverFor(item);
    if (this.driver && this.driver !== driver) this.driver.stop();
    this.driver = driver;
    this.loadedKey = null;
    this.setState({ status: 'loading', error: undefined, progress: emptyProgressFor(item, startAt) });
    try {
      await driver.load(item, startAt);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (token !== this.loadToken) return;
    this.loadedKey = item.key;
    driver.setRate(isSpeech(item) ? this.state.readingRate : this.state.rate);
    if (autoplay) {
      driver.play();
      this.setState({ status: 'playing' });
    } else {
      this.setState({ status: 'paused' });
    }
  }

  private unload() {
    this.speechSounding = false;
    this.loadToken++;
    this.driver?.stop();
    this.driver = null;
    this.loadedKey = null;
  }

  private driverFor(item: PlayerItem): Driver {
    const name: DriverName = item.audio ? 'audio' : item.youtube ? 'youtube' : 'speech';
    if (!this.drivers[name]) {
      const events = this.eventsFor(name);
      this.drivers[name] = name === 'audio' ? new AudioDriver(events) : name === 'youtube' ? new YouTubeDriver(events) : new SpeechDriver(events);
    }
    return this.drivers[name]!;
  }

  /** Callbacks for one driver; ignored unless that driver is the active one. */
  private eventsFor(name: DriverName): DriverEvents {
    const isActive = () => this.driver !== null && this.driver === this.drivers[name];
    return {
      progress: (progress) => {
        if (!isActive()) return;
        this.state.progress = progress;
        this.emit();
      },
      playing: (isPlaying) => {
        if (!isActive() || this.state.status === 'loading') return;
        this.setState({ status: isPlaying ? 'playing' : 'paused', error: undefined });
      },
      ended: () => isActive() && this.onEnded(),
      error: (message) => {
        if (!isActive()) return;
        this.setState({ status: 'error', error: message });
      },
      sounding: (isSounding) => {
        if (!isActive() || this.speechSounding === isSounding) return;
        this.speechSounding = isSounding;
        this.emit();
      },
    };
  }

  private onEnded() {
    const { index, queue, repeat } = this.state;
    if (repeat === 'one') {
      this.unload();
      this.start(true, 0);
    } else if (index < queue.length - 1) {
      this.jumpTo(index + 1);
    } else if (repeat === 'all') {
      this.jumpTo(0);
    } else {
      this.unload();
      this.setState({ status: 'paused', progress: { ...this.state.progress, current: 0 } });
    }
  }

  /** Must run synchronously inside the click, before any await. */
  private prime(item: PlayerItem | undefined) {
    if (item && !item.audio && !item.youtube) primeSpeech();
  }

  private setState(patch: Partial<PlayerState>) {
    Object.assign(this.state, patch);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state);
    this.updateMediaSession();
    this.syncBacksound();
    this.save();
  }

  private syncBacksound() {
    const { status, backsoundOn, backsoundLevel } = this.state;
    const item = this.current;
    // Wait for the voice: never leave the background sound playing on its own.
    const active = backsoundOn && isSpeech(item) && status === 'playing' && this.speechSounding;
    this.backsound.sync(item?.backsound, active, backsoundLevel);
  }

  private save(force = false) {
    const now = Date.now();
    if (!force && now - this.lastSaved < 2000) return;
    this.lastSaved = now;
    const { queue, index, rate, readingRate, backsoundOn, backsoundLevel, repeat, progress } = this.state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index, rate, readingRate, backsoundOn, backsoundLevel, repeat, position: progress.current }));
    } catch {
      /* storage unavailable: the queue lasts until the tab closes */
    }
  }

  private restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!saved || !Array.isArray(saved.queue)) return;
      const queue = saved.queue.filter((i: PlayerItem) => i && i.key && i.title && i.href);
      const index = Math.min(Math.max(0, saved.index | 0), Math.max(0, queue.length - 1));
      Object.assign(this.state, {
        queue,
        index,
        rate: RATES.includes(saved.rate) ? saved.rate : 1,
        readingRate: READING_RATES.includes(saved.readingRate) ? saved.readingRate : DEFAULT_READING_RATE,
        backsoundOn: saved.backsoundOn !== false,
        backsoundLevel: typeof saved.backsoundLevel === 'number' ? Math.max(0, Math.min(2, saved.backsoundLevel)) : 1,
        repeat: ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off',
        status: queue.length ? 'paused' : 'idle',
        progress: emptyProgressFor(queue[index], Number(saved.position) || 0),
      });
    } catch {
      /* ignore a corrupt or unavailable saved queue */
    }
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => this.toggle()],
      ['pause', () => this.pause()],
      ['previoustrack', () => this.prev()],
      ['nexttrack', () => this.next()],
      ['seekbackward', () => this.skip(-1)],
      ['seekforward', () => this.skip(1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported in this browser */
      }
    }
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const item = this.current;
    navigator.mediaSession.playbackState = this.state.status === 'playing' ? 'playing' : this.state.status === 'idle' ? 'none' : 'paused';
    if (item?.key === this.metadataKey) return;
    this.metadataKey = item?.key ?? null;
    navigator.mediaSession.metadata = item
      ? new MediaMetadata({ title: item.title, artist: item.subtitle ?? '', album: 'then.my.id' })
      : null;
  }
}

function dedupe(items: PlayerItem[]): PlayerItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.key) && seen.add(i.key));
}

export const player = new PlayerEngine();
