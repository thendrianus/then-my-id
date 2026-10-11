import type { Driver, DriverEvents, PlayerItem } from './types';

/**
 * Plays audio files. The <audio> element is never attached to the page,
 * so page navigation cannot interrupt it.
 */
export class AudioDriver implements Driver {
  private el = new Audio();
  private active = false;
  private pendingSeek = 0;

  constructor(private events: DriverEvents) {
    const el = this.el;
    el.preload = 'metadata';
    const emit = () => this.active && this.emitProgress();
    el.addEventListener('timeupdate', emit);
    el.addEventListener('durationchange', emit);
    el.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek) el.currentTime = this.pendingSeek;
      this.pendingSeek = 0;
      emit();
    });
    el.addEventListener('playing', () => this.active && events.playing(true));
    el.addEventListener('pause', () => this.active && !el.ended && events.playing(false));
    el.addEventListener('ended', () => this.active && events.ended());
    el.addEventListener('error', () => {
      if (this.active && el.getAttribute('src')) events.error('This audio file could not be played.');
    });
  }

  async load(item: PlayerItem, startAt: number) {
    if (!item.audio) throw new Error('No audio file for this item.');
    this.active = true;
    this.pendingSeek = startAt;
    this.el.src = item.audio;
    this.el.load();
  }

  play() {
    this.el.play().catch((err: DOMException) => {
      // AbortError just means a newer load() interrupted this play().
      if (this.active && err.name !== 'AbortError') {
        this.events.error(err.name === 'NotAllowedError' ? 'Press play to start.' : 'This audio file could not be played.');
      }
    });
  }

  pause() {
    this.el.pause();
  }

  stop() {
    this.active = false;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  seek(seconds: number) {
    if (this.el.readyState === 0) this.pendingSeek = seconds;
    else this.el.currentTime = Math.max(0, Math.min(seconds, this.el.duration || seconds));
    this.emitProgress();
  }

  skip(direction: 1 | -1) {
    this.seek(this.el.currentTime + direction * 10);
  }

  setRate(rate: number) {
    this.el.playbackRate = rate;
    this.el.defaultPlaybackRate = rate;
  }

  private emitProgress() {
    const total = Number.isFinite(this.el.duration) ? this.el.duration : 0;
    const current = this.el.readyState === 0 ? this.pendingSeek : this.el.currentTime;
    this.events.progress({ current, total, unit: 'seconds' });
  }
}
