// Transfermarkt's internal JSON API (tmapi). The website itself is behind a bot wall from servers, but this
// API answers without headers. Used for what nobody else has: contracts, joined dates and squad values.
import { TTL, cached, getJson } from "./espn.ts";
import { norm, similar } from "./fotmob.ts";

const API = "https://tmapi-alpha.transfermarkt.technology";
const COMP: Record<string, string> = { "esp.1": "ES1", "eng.1": "GB1", "ger.1": "L1" };

const get = (path: string, ttl = TTL.day) => getJson<any>(`${API}${path}`, ttl).then((r) => r.data);
const ids = (key: string, list: (string | number)[]) => list.map((i) => `${key}[]=${i}`).join("&");

type TmClub = { id: string; name: string; short: string; size: number; avgAge?: number; value: number };

/** Every club in a league with its squad value; also the basis for matching ESPN teams to TM ids. */
export function leagueClubs(league: string): Promise<TmClub[]> {
  const comp = COMP[league];
  if (!comp) return Promise.resolve([]);
  return cached(`tm-league:${comp}`, TTL.day, async () => {
    const table = await get(`/competition/${comp}/table`);
    const clubIds: string[] = (table?.tables?.[0]?.clubs ?? []).map((c: any) => String(c.clubId));
    const clubs: any[] = await get(`/clubs?${ids("ids", clubIds)}`);
    return clubs.map((c) => {
      const sd = c.squadDetails ?? {};
      return {
        id: String(c.id),
        name: c.name,
        short: c.baseDetails?.shortName ?? c.name,
        size: sd.squadSize ?? 0,
        avgAge: sd.averageAge,
        value: (sd.averageMarketValue?.value ?? 0) * (sd.squadSize ?? 0),
      };
    });
  });
}

export async function findClub(league: string, name: string) {
  const clubs = await leagueClubs(league);
  let best: TmClub | undefined;
  let score = 0;
  for (const c of clubs) {
    const s = Math.max(similar(c.name, name), similar(c.short, name));
    if (s > score) (best = c), (score = s);
  }
  if (!best || score < 0.5) return undefined;
  const ranked = [...clubs].sort((a, b) => b.value - a.value);
  return { club: best, valueRank: ranked.indexOf(best) + 1, of: clubs.length };
}

export type TmPlayer = { name: string; jersey?: string; contractUntil?: string; joined?: string; marketValue?: number; foot?: string; heightCm?: number; position?: string; formerClubs?: string; portrait?: string };

export function squad(clubId: string): Promise<TmPlayer[]> {
  return cached(`tm-squad:${clubId}`, TTL.day, async () => {
    const sq = await get(`/club/${clubId}/squad`);
    const playerIds: string[] = sq?.playerIds ?? (sq?.squad ?? []).map((p: any) => p.playerId);
    if (!playerIds.length) return [];
    const players: any[] = await get(`/players?${ids("ids", playerIds)}`);
    return players.map((p) => {
      const a = p.attributes ?? {};
      const cur = (p.clubAssignments ?? []).find((x: any) => x.type === "current");
      return {
        name: p.displayName ?? p.name,
        jersey: cur?.shirtNumber != null ? String(cur.shirtNumber) : undefined,
        contractUntil: a.contractUntil ?? undefined,
        joined: cur?.start ?? undefined,
        marketValue: p.marketValueDetails?.current?.value ?? undefined,
        foot: a.preferredFoot?.name ?? undefined,
        heightCm: a.height ? Math.round(a.height * 100) : undefined,
        position: a.position?.name ?? a.positionGroupName,
        formerClubs: a.formerClubsNote ?? undefined,
        portrait: p.portraitUrl,
      };
    });
  });
}

