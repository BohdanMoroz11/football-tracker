import type { Table, TableRow } from "../shared/types.ts";
import { espn } from "./espn.ts";
import { leagueById } from "./leagues.ts";

export async function getTable(league: string): Promise<Table> {
  const s = await espn.standings(league);
  const groups = ((s.children ?? []) as any[]).map((ch) => ({
    name: s.children.length > 1 ? ch.name : undefined,
    rows: ((ch.standings?.entries ?? []) as any[]).map(row).sort((a, b) => a.rank - b.rank),
  }));
  return { league, name: leagueById(league).name, groups };
}

function row(e: any): TableRow {
  const st = new Map<string, any>((e.stats ?? []).map((x: any) => [x.name, x]));
  const n = (k: string) => Number(st.get(k)?.value ?? 0);
  const note = e.note;
  return {
    rank: n("rank"),
    teamId: String(e.team.id),
    name: e.team.shortDisplayName ?? e.team.displayName,
    abbr: e.team.abbreviation,
    logo: e.team.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/soccer/500/${e.team.id}.png`,
    played: n("gamesPlayed"),
    w: n("wins"),
    d: n("ties"),
    l: n("losses"),
    gf: n("pointsFor"),
    ga: n("pointsAgainst"),
    gd: n("pointDifferential"),
    pts: n("points"),
    // ESPN sometimes sends "##c6d1e0".
    zone: note?.description ? { label: note.description, color: `#${String(note.color ?? "").replace(/#/g, "")}` } : undefined,
  };
}
