import { backsoundSupported } from './backsound';
import { type PlayerState, player } from './engine';
import { saveVoiceName, savedVoiceName, speechSupported, voicesFor } from './speech';
import type { PlayerItem } from './types';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function minutesLeft(seconds = 0): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `~${m} min left`;
}

/** Wire up the player bar. Runs once; the bar survives page navigation. */
export function initPlayerUI() {
  const root = document.getElementById('player');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  const el = {
    now: $<HTMLAnchorElement>(root, '.player-now'),
    title: $(root, '.player-title'),
    sub: $(root, '.player-sub'),
    caption: $(root, '.player-caption'),
    time: $(root, '.player-time'),
    seek: $<HTMLInputElement>(root, '.player-seek'),
    toggle: $<HTMLButtonElement>(root, '[data-cmd="toggle"]'),
    back: $<HTMLButtonElement>(root, '[data-cmd="back"]'),
    forward: $<HTMLButtonElement>(root, '[data-cmd="forward"]'),
    rate: $<HTMLButtonElement>(root, '[data-cmd="rate"]'),
    repeat: $<HTMLButtonElement>(root, '[data-cmd="repeat"]'),
    queueBtn: $<HTMLButtonElement>(root, '[data-cmd="queue"]'),
    count: $(root, '.player-count'),
    panel: $(root, '.player-queue'),
    list: $<HTMLOListElement>(root, '.queue-list'),
    rowTemplate: $<HTMLTemplateElement>(root, '#queue-row'),
    backsoundBtn: $<HTMLButtonElement>(root, '[data-cmd="backsound"]'),
    backsoundWrap: $(root, '.queue-backsound'),
    backsoundName: $(root, '.queue-backsound-name'),
    backsoundLevel: $<HTMLInputElement>(root, '.queue-backsound input'),
    voiceWrap: $(root, '.queue-voice'),
    voice: $<HTMLSelectElement>(root, '.queue-voice select'),
    error: $(root, '.player-error'),
    toast: $(root, '.player-toast'),
  };

  let seeking = false;
  let renderedQueue = '';

  // ---- player bar commands ----
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (!btn) return;
    const row = btn.closest<HTMLElement>('[data-index]');
    const index = row ? Number(row.dataset.index) : -1;
    switch (btn.dataset.cmd) {
      case 'toggle': return player.toggle();
      case 'prev': return player.prev();
      case 'next': return player.next();
      case 'back': return player.skip(-1);
      case 'forward': return player.skip(1);
      case 'rate': return player.cycleRate();
      case 'backsound': return player.toggleBacksound();
      case 'repeat': return player.cycleRepeat();
      case 'shuffle': return player.shuffle();
      case 'clear': return player.clear();
      case 'queue': return setPanel(Boolean(el.panel.hidden));
      case 'close-queue': return setPanel(false);
      case 'jump': return index === player.state.index ? player.toggle() : player.jumpTo(index);
      case 'up': return player.move(index, index - 1);
      case 'down': return player.move(index, index + 1);
      case 'remove': return player.remove(index);
    }
  });

  el.seek.addEventListener('input', () => {
    seeking = true;
    const { unit, total } = player.state.progress;
    const value = Number(el.seek.value);
    el.time.textContent = unit === 'seconds' ? `${formatTime(value)} / ${formatTime(total)}` : `${value + 1} / ${total}`;
  });
  el.seek.addEventListener('change', () => {
    seeking = false;
    player.seek(Number(el.seek.value));
  });

  el.backsoundLevel.addEventListener('input', () => player.setBacksoundLevel(Number(el.backsoundLevel.value)));

  el.voice.addEventListener('change', () => {
    const lang = player.current?.lang ?? 'en';
    saveVoiceName(lang, el.voice.value);
    player.refreshVoice();
  });
  if (speechSupported()) window.speechSynthesis.addEventListener?.('voiceschanged', () => renderVoices(player.state));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.panel.hidden) setPanel(false);
  });

  function setPanel(open: boolean) {
    el.panel.hidden = !open;
    el.queueBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      renderVoices(player.state);
      el.list.querySelector<HTMLElement>('.is-current .queue-play')?.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- buttons on the pages ("Listen", "Play all", "Add to queue") ----
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-player-action]');
    const host = btn?.closest<HTMLElement>('[data-player-items]');
    if (!btn || !host) return;
    e.preventDefault();
    let items: PlayerItem[];
    try {
      items = JSON.parse(host.dataset.playerItems ?? '[]');
    } catch {
      return;
    }
    if (!items.length) return;
    player.refresh(items);
    const action = btn.dataset.playerAction;
    const single = items.length === 1 ? items[0] : null;

    if (action === 'play') {
      // The play button for what's already playing works as pause/resume.
      if (single && player.current?.key === single.key) return player.toggle();
      // A row inside a list plays the whole list, starting at that row.
      const context = host.dataset.playerStart !== undefined && host.closest<HTMLElement>('[data-player-context]');
      if (context) {
        try {
          const all: PlayerItem[] = JSON.parse(context.dataset.playerContext ?? '[]');
          const start = Number(host.dataset.playerStart);
          if (all[start]?.key === single?.key) return player.playNow(all, start);
        } catch {
          /* fall back to playing just this item */
        }
      }
      player.playNow(items);
    } else if (action === 'shuffle') {
      player.playNow(shuffled(items));
    } else if (action === 'next') {
      const n = player.playNext(items);
      toast(n ? `Playing next: ${single ? single.title : `${n} items`}` : 'Already up next');
    } else if (action === 'queue') {
      const n = player.enqueue(items);
      toast(n ? `Added to queue: ${single ? single.title : `${n} items`}` : 'Already in your queue');
    }
  });

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(message: string) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 2400);
  }

  // ---- render ----
  function render(state: PlayerState) {
    const item = state.queue[state.index];
    root!.hidden = !item;
    root!.dataset.status = state.status;
    root!.dataset.kind = item?.kind ?? '';
    if (item) {
      el.title.textContent = item.title;
      el.sub.textContent = item.subtitle ?? '';
      el.now.href = item.href;
    }

    const p = state.progress;
    const reading = p.unit === 'sentences';
    el.caption.textContent = reading && state.status !== 'idle' ? (p.caption ?? '') : '';
    el.caption.hidden = !el.caption.textContent;
    if (!seeking) {
      el.seek.max = String(reading ? Math.max(0, p.total - 1) : p.total || 0);
      el.seek.step = reading ? '1' : 'any';
      el.seek.value = String(p.current);
      el.seek.disabled = !p.total;
      el.seek.style.setProperty('--fill', `${p.total ? (p.current / (reading ? Math.max(1, p.total - 1) : p.total)) * 100 : 0}%`);
      el.time.textContent = reading
        ? p.total
          ? `${p.current + 1} / ${p.total} · ${minutesLeft(p.remaining)}`
          : 'Read aloud'
        : `${formatTime(p.current)} / ${p.total ? formatTime(p.total) : '–:––'}`;
    }
    el.seek.setAttribute('aria-valuetext', el.time.textContent ?? '');

    const playing = state.status === 'playing' || state.status === 'loading';
    el.toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    el.back.setAttribute('aria-label', reading ? 'Previous sentence' : 'Back 10 seconds');
    el.forward.setAttribute('aria-label', reading ? 'Next sentence' : 'Forward 10 seconds');
    el.back.title = el.back.getAttribute('aria-label')!;
    el.forward.title = el.forward.getAttribute('aria-label')!;
    el.rate.textContent = `${reading ? state.readingRate : state.rate}×`;
    el.rate.title = reading ? 'Reading speed' : 'Playback speed';
    el.rate.setAttribute('aria-label', `${el.rate.title}: ${el.rate.textContent}`);
    el.repeat.dataset.mode = state.repeat;
    el.repeat.setAttribute('aria-pressed', String(state.repeat !== 'off'));
    el.repeat.title = el.repeat.ariaLabel = { off: 'Repeat: off', all: 'Repeat: whole queue', one: 'Repeat: this one' }[state.repeat];
    el.count.textContent = String(state.queue.length);

    const bs = item?.kind === 'post' && backsoundSupported ? item.backsound : undefined;
    el.backsoundBtn.hidden = !bs;
    el.backsoundWrap.hidden = !bs;
    if (bs) {
      const label = `Background sound: ${bs.name} (${state.backsoundOn ? 'on' : 'off'})`;
      el.backsoundBtn.setAttribute('aria-pressed', String(state.backsoundOn));
      el.backsoundBtn.setAttribute('aria-label', label);
      el.backsoundBtn.title = label;
      el.backsoundName.textContent = `Background: ${bs.name}`;
      if (document.activeElement !== el.backsoundLevel) el.backsoundLevel.value = String(state.backsoundOn ? state.backsoundLevel : 0);
    }
    el.error.textContent = state.status === 'error' ? (state.error ?? 'Something went wrong.') : '';
    el.error.hidden = state.status !== 'error';

    renderQueue(state);
    syncPageButtons(state);
  }

  function renderQueue(state: PlayerState) {
    const signature = state.queue.map((q) => q.key).join('|') + `#${state.index}`;
    if (signature === renderedQueue) return;
    renderedQueue = signature;
    if (!state.queue.length) setPanel(false);
    el.list.replaceChildren(
      ...state.queue.map((item, i) => {
        const row = el.rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
        row.dataset.index = String(i);
        row.dataset.kind = item.kind;
        row.classList.toggle('is-current', i === state.index);
        $(row, '.queue-title').textContent = item.title;
        $(row, '.queue-sub').textContent = item.kind === 'post' ? `Read aloud · ${item.subtitle ?? ''}` : (item.subtitle ?? '');
        $<HTMLButtonElement>(row, '[data-cmd="up"]').disabled = i === 0;
        $<HTMLButtonElement>(row, '[data-cmd="down"]').disabled = i === state.queue.length - 1;
        if (i === state.index) $(row, '.queue-play').setAttribute('aria-current', 'true');
        return row;
      }),
    );
    renderVoices(state);
  }

  function renderVoices(state: PlayerState) {
    const item = state.queue[state.index];
    const voices = item?.kind === 'post' && speechSupported() ? voicesFor(item.lang ?? 'en') : [];
    el.voiceWrap.hidden = voices.length < 2;
    if (voices.length < 2) return;
    const saved = savedVoiceName(item!.lang ?? 'en') ?? '';
    el.voice.replaceChildren(
      new Option('Automatic', ''),
      ...voices.map((v) => new Option(`${v.name} (${v.lang})${v.localService ? '' : ' · online'}`, v.name, false, v.name === saved)),
    );
  }

  render(player.state);
  player.subscribe(render);
  // New page: mark which of its buttons belong to what's playing.
  document.addEventListener('astro:page-load', () => syncPageButtons(player.state));
}

/** Give "Listen"/"Play" buttons and list rows a playing state that matches the player. */
function syncPageButtons(state: PlayerState) {
  const key = state.queue[state.index]?.key;
  const playing = state.status === 'playing' || state.status === 'loading';

  for (const host of document.querySelectorAll<HTMLElement>('[data-player-key]')) {
    const isCurrent = host.dataset.playerKey === key;
    host.classList.toggle('is-current', isCurrent);
    host.dataset.playing = String(isCurrent && playing);
    const play = host.querySelector<HTMLElement>('[data-player-action="play"]');
    if (play && host.hasAttribute('data-player-items')) {
      const label = play.querySelector('.label');
      const idle = play.dataset.label ?? 'Play';
      if (label) label.textContent = isCurrent && playing ? 'Pause' : isCurrent ? 'Resume' : idle;
      play.setAttribute('aria-pressed', String(isCurrent && playing));
    }
  }
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
