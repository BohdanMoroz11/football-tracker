// FotMob's public web API (unofficial, keyless; the /api/data/ prefix is what works in 2026).
// Fills ESPN's gaps: predicted lineups, ratings, xG, momentum, referee, weather, injuries, coaches, photos.
import { TTL, cached, getJson } from "./espn.ts";

const API = "https://www.fotmob.com/api/data";

export const FM_LEAGUE: Record<string, number> = {
  "esp.1": 87,
  "eng.1": 47,
  "ger.1": 54,
  "uefa.champions": 42,
  "uefa.europa": 73,
  "esp.copa_del_rey": 138,
  "eng.fa": 132,
  "ger.dfb_pokal": 209,
};

export const fmPhoto = (id?: number | string) => (id ? `https://images.fotmob.com/image_resources/playerimages/${id}.png` : undefined);

export const fotmob = {
  matches: (ymd: string) => getJson(`${API}/matches?date=${ymd}`, TTL.short),
  match: (id: string | number, ttl = TTL.live) => getJson(`${API}/matchDetails?matchId=${id}`, ttl),
  team: (id: string | number) => getJson(`${API}/teams?id=${id}`, TTL.long),
  person: (id: string | number) => getJson(`${API}/playerData?id=${id}`, TTL.day),
  statList: (url: string) => getJson(url, TTL.long),
};

/** Accent-free, lowercase, punctuation-free, for loose name comparison across providers. */
export function norm(s = "") {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(fc|cf|afc|sc|ac|cd|ud|rcd|sd|club|de|real|the|and|hove|albion|tsg|vfb|vfl|bayer|borussia|1)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<string, string> = {
  "bayern munchen": "bayern munich",
  "internazionale": "inter",
  "man utd": "manchester united",
  "wolverhampton wanderers": "wolves",
  "atletico madrid": "atletico",
  "atletico": "atletico",
  "athletic": "athletic",
  "psg": "paris saint germain",
};

function teamKey(name: string) {
  const n = norm(name);
  return ALIASES[n] ?? n;
}

/** Name similarity in [0,1] by shared tokens, generous enough for "Celta Vigo" vs "Celta" or "Bayern München" vs "Bayern Munich". */
export function similar(a: string, b: string) {
  const ka = teamKey(a), kb = teamKey(b);
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) return 0.85;
  const ta = new Set(ka.split(" ").filter((t) => t.length > 2));
  const tb = new Set(kb.split(" ").filter((t) => t.length > 2));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.max(1, Math.min(ta.size, tb.size));
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Find FotMob's match id for an ESPN match by kickoff time and team names. Cached for the day. */
export function findMatchId(league: string, kickoffIso: string, home: string, away: string): Promise<string | undefined> {
  return cached(`fm-find:${league}:${kickoffIso}:${home}:${away}`, TTL.day, async () => {
    const t = Date.parse(kickoffIso);
    const fmLeague = FM_LEAGUE[league];
    for (const offset of [0, -1, 1]) {
      const day = await fotmob.matches(ymd(new Date(t + offset * 86400_000))).catch(() => undefined);
      for (const l of day?.leagues ?? []) {
        if (fmLeague && l.primaryId !== fmLeague && l.parentLeagueId !== fmLeague) continue;
        for (const m of l.matches ?? []) {
          const close = Math.abs(Date.parse(m.status?.utcTime ?? m.time) - t) < 3 * 3600_000;
          const score = similar(m.home?.name ?? "", home) + similar(m.away?.name ?? "", away);
          if (close && score >= 1.2) return String(m.id);
        }
      }
    }
    return undefined;
  });
}

/** Pair players across providers: same shirt number and a plausible name, else a strong name match. */
export function matchPerson<T extends { name: string; jersey?: string }>(
  people: T[],
  name: string,
  jersey?: string | number,
): T | undefined {
  const n = norm(name);
  if (jersey != null && jersey !== "") {
    const byNo = people.filter((p) => p.jersey === String(jersey));
    const ok = byNo.find((p) => nameClose(norm(p.name), n));
    if (ok) return ok;
    if (byNo.length === 1 && !people.some((p) => p !== byNo[0] && nameClose(norm(p.name), n))) return byNo[0];
  }
  return people.find((p) => norm(p.name) === n) ?? people.find((p) => nameClose(norm(p.name), n));
}

function nameClose(a: string, b: string) {
  if (a === b) return true;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const la = ta[ta.length - 1];
  const lb = tb[tb.length - 1];
  // Same surname either way round ("Rodrygo Goes" vs "Rodrygo", "Hernández" vs "Theo Hernández").
  if (lb.length > 2 && ta.includes(lb)) return true;
  if (la.length > 2 && tb.includes(la)) return true;
  // Mononyms share a long token ("Vinícius" vs "Vinícius Júnior"); first names alone never count.
  return (ta.length === 1 || tb.length === 1) && ta.some((t) => t.length > 3 && tb.includes(t));
}
