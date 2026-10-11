import type { Backsound } from './types';

const FADE_MS = 900;
const STEP_MS = 50;

/**
 * iOS ignores `audio.volume` (it's always 1), so a "quiet" backsound would play
 * at full volume over the voice. On such devices backsounds are not played.
 */
export const backsoundSupported = (() => {
  if (typeof Audio === 'undefined') return false;
  const probe = new Audio();
  probe.volume = 0.5;
  return probe.volume === 0.5;
})();

/** Loops a quiet background sound under a note that's being read aloud. */
export class BacksoundMixer {
  private el = new Audio();
  private current: Backsound | null = null;
  private target = 0;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.el.loop = true;
    this.el.preload = 'none';
    this.el.volume = 0;
  }

  /**
   * Bring the background sound in line with the player: play `sound` at `level`
   * (the listener's multiplier) while `active`, otherwise fade it out.
   */
  sync(sound: Backsound | undefined, active: boolean, level: number) {
    if (!backsoundSupported) return;
    if (!sound || !active || level <= 0) return this.fadeTo(0);

    if (this.current?.src !== sound.src) {
      this.current = sound;
      this.el.volume = 0;
      this.el.src = sound.src;
    }
    if (this.el.paused) {
      this.el.play().catch(() => {
        /* blocked or failed: the note still reads fine without it */
      });
    }
    this.fadeTo(Math.min(1, sound.volume * level));
  }

  private fadeTo(target: number) {
    if (target === this.target && !this.fadeTimer) return;
    this.target = target;
    clearInterval(this.fadeTimer);
    const step = Math.max(0.005, Math.abs(target - this.el.volume) / (FADE_MS / STEP_MS));
    this.fadeTimer = setInterval(() => {
      const v = this.el.volume;
      const next = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
      this.el.volume = next;
      if (next === target) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = undefined;
        if (target === 0) this.el.pause();
      }
    }, STEP_MS);
  }
}
