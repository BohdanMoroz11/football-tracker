import type { LineupPlayer, MatchDetail, Side } from "../shared/types.ts";
import { espn, soft } from "./espn.ts";
import { mapMatch } from "./match.ts";
import { enrichMatch } from "./enrich.ts";
import { fillProbable } from "./probable.ts";
import { fmPhoto, fotmob, matchPerson } from "./fotmob.ts";
import { getTable } from "./standings.ts";

export async function getMatch(league: string, id: string): Promise<MatchDetail> {
  const m = await enrichMatch(mapMatch(league, await espn.summary(league, id)));
  await fillProbable(m);
  await Promise.all((["home", "away"] as Side[]).map((s) => decorateFromSquad(m, s)));
  const table = await soft(getTable(league), "table");
  for (const s of ["home", "away"] as Side[]) {
    m[s].rank = table?.groups.flatMap((g) => g.rows).find((r) => r.teamId === m[s].id)?.rank;
  }
  return m;
}

/** Probable XIs (and lineups FotMob couldn't match) still deserve photos and ratings: take them from FotMob's squad. */
async function decorateFromSquad(m: MatchDetail, side: Side) {
  const l = m.lineups[side];
  const missing = [...l.starters, ...l.bench].filter((p) => !p.fmId);
  const fmTeamId = m.fm?.teamIds[side];
  if (!missing.length || !fmTeamId) return;
  const team = await soft(fotmob.team(fmTeamId), "fotmob team");
  const members = ((team?.squad?.squad ?? []) as any[])
    .filter((g) => g.title !== "coach")
    .flatMap((g) => g.members ?? [])
    .map((x: any) => ({ ...x, jersey: x.shirtNumber != null ? String(x.shirtNumber) : undefined }));
  for (const p of missing as LineupPlayer[]) {
    const f = matchPerson(members, p.name, p.jersey);
    if (!f) continue;
    p.fmId = f.id;
    p.photo = fmPhoto(f.id);
    p.seasonRating = f.rating || undefined;
    p.marketValue = f.transferValue;
    p.age = f.age;
    p.nationality = f.cname;
  }
}
