// Thin client over ESPN's public (unofficial, keyless) soccer API with an in-memory TTL cache.
// Every competition uses the same endpoints; only the league slug changes (esp.1, eng.1, ...).

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer";
const ATHLETE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";

export const TTL = {
  live: 15_000,
  short: 5 * 60_000,
  medium: 30 * 60_000,
  long: 6 * 3600_000,
  day: 24 * 3600_000,
};

type Entry = { at: number; ttl: number; value: Promise<any> };
const cache = new Map<string, Entry>();

export async function getJson<T = any>(url: string, ttl: number, init?: RequestInit): Promise<T> {
  return cached(url, ttl, () =>
    fetch(url, { ...init, headers: { "User-Agent": "Mozilla/5.0 (football-tracker personal project)", ...init?.headers } }).then(async (r) => {
      if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status} for ${url}`);
      return r.json();
    }),
  );
}

/** Memoize any async producer under a key. The caller's TTL counts too: the same key can be wanted fresher than it was first cached for. */
export function cached<T>(key: string, ttl: number, produce: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < Math.min(hit.ttl, ttl)) return hit.value;
  const value = produce();
  cache.set(key, { at: Date.now(), ttl, value });
  // Don't keep failures around.
  value.catch(() => cache.delete(key));
  return value;
}

export function cacheStats() {
  return { entries: cache.size };
}

/** Run async fn over items with limited concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Like Promise.all over optional sources: a failing enrichment (scraped site down) becomes undefined instead of breaking the page. */
export async function soft<T>(p: Promise<T>, label: string): Promise<T | undefined> {
  try {
    return await p;
  } catch (err) {
    console.warn(`[soft] ${label}: ${(err as Error).message}`);
    return undefined;
  }
}

export const espn = {
  scoreboard: (league: string, date?: string) => getJson(`${SITE}/${league}/scoreboard${date ? `?dates=${date}` : ""}`, TTL.live),
  // Always short: the browser decides how often to ask (fast while live, slow otherwise).
  summary: (league: string, eventId: string, ttl = TTL.live) => getJson(`${SITE}/${league}/summary?event=${eventId}`, ttl),
  team: (league: string, teamId: string) => getJson(`${SITE}/${league}/teams/${teamId}`, TTL.medium),
  roster: (league: string, teamId: string) => getJson(`${SITE}/${league}/teams/${teamId}/roster`, TTL.long),
  // "all" spans every competition the club plays in: league, cups, Europe.
  results: (teamId: string) => getJson(`${SITE}/all/teams/${teamId}/schedule`, TTL.medium),
  fixtures: (teamId: string) => getJson(`${SITE}/all/teams/${teamId}/schedule?fixture=true`, TTL.medium),
  teamNews: (league: string, teamId: string) => getJson(`${SITE}/${league}/news?team=${teamId}&limit=8`, TTL.medium),
  standings: (league: string, season?: number) =>
    getJson(`${STANDINGS}/${league}/standings${season ? `?season=${season}` : ""}`, season ? TTL.day : TTL.short),
  athlete: (id: string) => getJson(`${ATHLETE}/athletes/${id}`, TTL.long),
  athleteOverview: (id: string) => getJson(`${ATHLETE}/athletes/${id}/overview`, TTL.medium),
  athleteGamelog: (league: string, id: string) => getJson(`${ATHLETE}/${league}/athletes/${id}/gamelog`, TTL.medium),
};
