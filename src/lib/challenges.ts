import { type CollectionEntry, getCollection } from 'astro:content';

export type Challenge = CollectionEntry<'challenges'>;

/** A day on the calendar, as YYYY-MM-DD. All date maths is done in UTC so days never shift. */
export type DayKey = string;

export interface LoggedDay {
  amount: number;
  notes: string[];
}

export interface CalendarMonth {
  label: string;
  /** Weeks, Monday first. `null` pads the days before the 1st and after the last day. */
  weeks: (DayKey | null)[][];
}

export interface ChallengeStats {
  days: Map<DayKey, LoggedDay>;
  done: number;
  target: number;
  percent: number;
  remaining: number;
  complete: boolean;
  start: DayKey;
  /** Last day with a log entry, if any. */
  lastLogged?: DayKey;
  /** Daily: the day the target is reached if no more days are missed. Weekly and flexible: the deadline, if set. */
  finish?: DayKey;
  /** Daily only: consecutive days ending on the last logged day. */
  currentStreak: number;
  bestStreak: number;
  months: CalendarMonth[];
}

export const toKey = (d: Date): DayKey => d.toISOString().slice(0, 10);
const fromKey = (k: DayKey) => new Date(`${k}T00:00:00Z`);

export function addDays(k: DayKey, n: number): DayKey {
  const d = fromKey(k);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
export const formatNumber = (n: number) => number.format(n);

/** "1 day", "3 days", "2.5 km". Drops a plural "s"/"es" when the amount is exactly 1. */
export function formatAmount(amount: number, unit: string): string {
  let u = unit;
  if (amount === 1) {
    if (/(s|x|ch|sh)es$/.test(u)) u = u.slice(0, -2);
    else if (/[^s]s$/.test(u)) u = u.slice(0, -1);
  }
  return `${number.format(amount)} ${u}`;
}

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const formatDay = (k: DayKey) => longDate.format(fromKey(k));

/** Published challenges: unfinished ones first, then newest start first. */
export async function getChallenges(): Promise<Challenge[]> {
  const all = await getCollection('challenges', (c) => import.meta.env.DEV || !c.data.draft);
  return all.sort((a, b) => {
    const doneA = challengeStats(a).complete ? 1 : 0;
    const doneB = challengeStats(b).complete ? 1 : 0;
    return doneA - doneB || b.data.start.valueOf() - a.data.start.valueOf();
  });
}

/** Turns the log (single days, ranges, or entries with amounts) into one total per day, plus the overall total. */
function collectDays(c: Challenge): { days: Map<DayKey, LoggedDay>; done: number } {
  const weekly = c.data.schedule === 'weekly';
  const days = new Map<DayKey, LoggedDay>();
  let done = 0;
  const add = (k: DayKey, amount: number, note?: string) => {
    const day = days.get(k) ?? { amount: 0, notes: [] };
    day.amount += amount;
    if (note) day.notes.push(note);
    days.set(k, day);
  };

  for (const entry of c.data.log) {
    if (entry instanceof Date) {
      add(toKey(entry), 1);
      done += 1;
    } else if (typeof entry === 'string') {
      const [from, to] = entry.split('..');
      if (to < from) throw new Error(`Challenge "${c.id}": the range ${entry} ends before it starts.`);
      let n = 0;
      for (let k = from; k <= to; k = addDays(k, 1), n++) add(k, 1);
      // A weekly range is one week, however many days it shades.
      done += weekly ? 1 : n;
    } else {
      add(toKey(entry.date), entry.amount, entry.note);
      done += entry.amount;
    }
  }

  const start = toKey(c.data.start);
  for (const k of days.keys()) {
    if (k < start) throw new Error(`Challenge "${c.id}": the log has ${k}, which is before the start date ${start}.`);
  }
  return { days: new Map([...days].sort(([a], [b]) => a.localeCompare(b))), done };
}

function streaks(keys: DayKey[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  let prev: DayKey | undefined;
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { current: run, best };
}

/** Every month from `from` to `to`, laid out in weeks starting on Monday. */
function calendarMonths(from: DayKey, to: DayKey): CalendarMonth[] {
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const months: CalendarMonth[] = [];
  const cursor = fromKey(from);
  cursor.setUTCDate(1);
  const last = fromKey(to);

  while (cursor <= last) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lead = (cursor.getUTCDay() + 6) % 7; // Monday = 0
    const cells: (DayKey | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(toKey(new Date(Date.UTC(year, month, d))));
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ label: label.format(cursor), weeks });
    cursor.setUTCMonth(month + 1);
  }
  return months;
}

export function challengeStats(c: Challenge): ChallengeStats {
  const { target, schedule } = c.data;
  const { days, done } = collectDays(c);
  const keys = [...days.keys()];
  const remaining = Math.max(0, target - done);
  const complete = done >= target;
  const start = toKey(c.data.start);
  const lastLogged = keys.at(-1);
  const { current, best } = streaks(keys);

  let finish: DayKey | undefined;
  if (schedule === 'daily') finish = addDays(lastLogged ?? addDays(start, -1), Math.ceil(remaining));
  else if (c.data.end) finish = toKey(c.data.end);

  // The calendar runs from the start to the planned finish (or deadline), the last log, or today, whichever is
  // latest. A finished challenge stops at its last logged day.
  const today = toKey(new Date());
  const candidates = [start, lastLogged, finish, c.data.end && toKey(c.data.end), complete ? undefined : today];
  const calendarEnd = complete && lastLogged ? lastLogged : candidates.filter((k): k is DayKey => !!k).sort().at(-1)!;

  return {
    days,
    done,
    target,
    percent: Math.min(100, Math.round((done / target) * 100)),
    remaining,
    complete,
    start,
    lastLogged,
    finish,
    currentStreak: schedule === 'daily' ? current : 0,
    bestStreak: schedule === 'daily' ? best : 0,
    months: calendarMonths(start, calendarEnd),
  };
}
