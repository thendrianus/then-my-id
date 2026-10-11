import type { Driver, DriverEvents, PlayerItem } from './types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load YouTube.'));
    };
    document.head.append(script);
  });
  return apiPromise;
}

const ERRORS: Record<number, string> = {
  2: 'This YouTube video id looks wrong.',
  5: 'YouTube could not play this video here.',
  100: 'This YouTube video was removed or made private.',
  101: 'The owner does not allow this video to be embedded.',
  150: 'The owner does not allow this video to be embedded.',
};

/**
 * Plays YouTube videos in a small floating window (YouTube requires the player
 * to stay visible). The window is attached to <html>, outside <body>, because
 * page navigation replaces <body> and moving an iframe would restart it.
 */
export class YouTubeDriver implements Driver {
  private player: any = null;
  private host: HTMLElement | null = null;
  private active = false;
  private rate = 1;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private events: DriverEvents) {}

  async load(item: PlayerItem, startAt: number) {
    if (!item.youtube) throw new Error('No YouTube video for this item.');
    this.active = true;
    const YT = await loadYouTubeApi();
    if (!this.active) return;
    this.showHost(true);
    if (!this.player) {
      await new Promise<void>((resolve) => {
        this.player = new YT.Player(this.mountPoint(), {
          width: 320,
          height: 180,
          videoId: item.youtube,
          playerVars: { playsinline: 1, rel: 0, start: Math.floor(startAt) },
          events: {
            onReady: () => resolve(),
            onStateChange: (e: { data: number }) => this.onStateChange(e.data),
            onError: (e: { data: number }) => this.active && this.events.error(ERRORS[e.data] ?? 'YouTube could not play this video.'),
          },
        });
      });
    } else {
      this.player.cueVideoById({ videoId: item.youtube, startSeconds: startAt });
    }
    this.player.setPlaybackRate?.(this.rate);
    this.emitProgress();
  }

  play() {
    this.player?.playVideo?.();
  }

  pause() {
    this.player?.pauseVideo?.();
  }

  stop() {
    this.active = false;
    clearInterval(this.timer);
    this.player?.stopVideo?.();
    this.showHost(false);
  }

  seek(seconds: number) {
    this.player?.seekTo?.(Math.max(0, seconds), true);
    this.emitProgress();
  }

  skip(direction: 1 | -1) {
    this.seek((this.player?.getCurrentTime?.() ?? 0) + direction * 10);
  }

  setRate(rate: number) {
    this.rate = rate;
    this.player?.setPlaybackRate?.(rate);
  }

  private onStateChange(state: number) {
    if (!this.active) return;
    const { PLAYING, PAUSED, ENDED } = window.YT.PlayerState;
    clearInterval(this.timer);
    if (state === PLAYING) {
      this.events.playing(true);
      this.timer = setInterval(() => this.emitProgress(), 500);
    } else if (state === PAUSED) {
      this.events.playing(false);
    } else if (state === ENDED) {
      this.events.ended();
    }
    this.emitProgress();
  }

  private emitProgress() {
    if (!this.active || !this.player?.getCurrentTime) return;
    this.events.progress({
      current: this.player.getCurrentTime() ?? 0,
      total: this.player.getDuration() ?? 0,
      unit: 'seconds',
    });
  }

  private mountPoint(): HTMLElement {
    const mount = document.createElement('div');
    this.ensureHost().append(mount);
    return mount;
  }

  private ensureHost(): HTMLElement {
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.id = 'yt-mini';
      this.host.setAttribute('aria-label', 'YouTube player');
      this.host.hidden = true;
      document.documentElement.append(this.host);
    }
    return this.host;
  }

  private showHost(show: boolean) {
    if (this.host || show) this.ensureHost().hidden = !show;
  }
}
