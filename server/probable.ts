// "Probable XI" before official lineups: start from the club's strongest recent XI, swap out anyone injured
// or suspended for whoever has been starting in that role, and say how sure we are about each pick.
import type { Absentee, Lineup, LineupPlayer, MatchDetail, Side } from "../shared/types.ts";
import { espn, soft } from "./espn.ts";
import { matchPerson } from "./fotmob.ts";
import { place } from "./formation.ts";
import { recentLineups, type RecentPlayer } from "./team.ts";
import { compShort, slugForCompetition } from "./leagues.ts";

const roleOf = (pos = ""): LineupPlayer["role"] =>
  pos === "G" ? "G" : /^(CD|LB|RB|D|LWB|RWB)/.test(pos) ? "D" : /^(CF|F|LF|RF|ST)/.test(pos) ? "F" : "M";

// Newer matches count more; a five-match-old lineup says little about this weekend.
const WEIGHTS = [1, 0.8, 0.65, 0.5, 0.4, 0.3];

export async function fillProbable(m: MatchDetail) {
  await Promise.all(
    (["home", "away"] as Side[]).map(async (side) => {
      const l = m.lineups[side];
      if (l.status === "official" || l.status === "probable") return;
      const p = await soft(probableXI(m.league, m[side].id, l.unavailable, m.date), `probable ${side}`);
      if (p) m.lineups[side] = { ...l, ...p, unavailable: l.unavailable, coach: l.coach, kit: l.kit };
    }),
  );
}

async function probableXI(league: string, teamId: string, unavailable: Absentee[], before: string): Promise<Partial<Lineup> | undefined> {
  const [res, roster] = await Promise.all([espn.results(teamId), soft(espn.roster(league, teamId), "roster")]);
  const past = ((res?.events ?? []) as any[])
    .filter((e) => e.competitions?.[0]?.status?.type?.state === "post" && e.date < before)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => {
      const comp = e.league?.name ?? "";
      const opp = e.competitions[0].competitors.find((c: any) => String(c.team.id) !== teamId);
      return { id: String(e.id), date: e.date, league: e.league?.slug ?? slugForCompetition(comp) ?? "", comp: compShort(comp), state: "post" as const, opponent: { id: String(opp?.team.id), name: opp?.team.shortDisplayName ?? "", abbr: "", logo: "" }, home: false };
    });
  const recent = await recentLineups(teamId, past);
  if (!recent.length) return undefined;

  const out = (p: { name: string; jersey?: string }) => !!matchPerson(unavailable.filter((u) => u.status !== "doubt"), p.name);
  // Weighted share of recent starts per player.
  const weight = new Map<string, number>();
  const total = recent.reduce((s, _r, i) => s + (WEIGHTS[i] ?? 0.2), 0);
  recent.forEach((r, i) => {
    for (const p of r.players) if (p.starter) weight.set(p.id, (weight.get(p.id) ?? 0) + (WEIGHTS[i] ?? 0.2));
  });
  const conf = (id: string) => Math.min(1, (weight.get(id) ?? 0) / total);

  // Base: among the last three, the XI made of the most regular starters (skips cup rotation).
  const base = recent
    .slice(0, 3)
    .map((r, i) => ({ r, score: r.players.filter((p) => p.starter).reduce((s, p) => s + conf(p.id), 0) - i * 0.3 }))
    .sort((a, b) => b.score - a.score)[0].r;

  const everyone = new Map<string, RecentPlayer>();
  // A player's role comes from games he started; bench entries only say "SUB".
  const startedAs = new Map<string, string>();
  for (const r of recent) for (const p of r.players) {
    if (!everyone.has(p.id)) everyone.set(p.id, p);
    if (p.starter && p.pos && !startedAs.has(p.id)) startedAs.set(p.id, p.pos);
  }
  // The squad list fills in roles (and candidates) for players who haven't started lately, e.g. a back-up keeper.
  for (const a of (roster?.athletes ?? []) as any[]) {
    const id = String(a.id);
    const abbr = a.position?.abbreviation ?? "";
    if (!startedAs.has(id)) startedAs.set(id, abbr === "G" ? "G" : abbr === "D" ? "CD" : abbr === "F" ? "F" : "CM");
    if (!everyone.has(id)) everyone.set(id, { id, name: a.displayName, short: a.shortName ?? a.displayName, jersey: a.jersey, starter: false, subIn: false });
  }
  const chosen = new Set<string>();
  const starters: (LineupPlayer & { place?: number })[] = [];
  const baseStarters = base.players.filter((p) => p.starter);
  const swaps: string[] = [];
  for (const slot of baseStarters) {
    let pick: RecentPlayer | undefined = out(slot) ? undefined : slot;
    if (!pick) {
      // Same role, most regular starter not already picked and fit.
      const role = roleOf(slot.pos);
      const free = [...everyone.values()]
        .filter((p) => !chosen.has(p.id) && !baseStarters.some((b) => b.id === p.id) && !out(p))
        .sort((a, b) => conf(b.id) - conf(a.id));
      const roleOfP = (p: RecentPlayer) => (startedAs.has(p.id) ? roleOf(startedAs.get(p.id)) : undefined);
      // Same role first; else the most regular unknown-role player (never an outfielder in goal or vice versa).
      pick = free.find((p) => roleOfP(p) === role) ?? (role === "G" ? undefined : free.find((p) => roleOfP(p) !== "G" && roleOfP(p) !== undefined) ?? free.find((p) => roleOfP(p) === undefined));
      if (pick) swaps.push(`${pick.short ?? pick.name} for ${slot.short ?? slot.name}`);
    }
    if (!pick) continue;
    chosen.add(pick.id);
    starters.push({
      id: pick.id,
      name: pick.name,
      short: pick.short ?? pick.name,
      jersey: pick.jersey,
      pos: slot.pos,
      place: slot.place,
      role: roleOf(slot.pos),
      starter: true,
      marks: { goals: [], ownGoals: [], pens: [], assists: [] },
      confidence: pick === slot ? conf(pick.id) : Math.max(0.25, conf(pick.id)),
    });
  }
  if (starters.length < 11) return undefined;
  const bench: LineupPlayer[] = [...everyone.values()]
    .filter((p) => !chosen.has(p.id) && !out(p))
    .sort((a, b) => conf(b.id) - conf(a.id))
    .slice(0, 9)
    .map((p) => ({ id: p.id, name: p.name, short: p.short ?? p.name, jersey: p.jersey, role: roleOf(startedAs.get(p.id)), starter: false, marks: { goals: [], ownGoals: [], pens: [], assists: [] }, confidence: conf(p.id) }));

  const placed = place(starters, base.formation).map(({ place: _p, ...rest }) => rest as LineupPlayer);
  const vs = `${base.comp} vs ${base.opponent}`;
  return {
    status: "probable",
    formation: base.formation,
    basis: `Our estimate: the XI from ${vs}${swaps.length ? `, with ${swaps.join(", ")}` : ""}. Based on the last ${recent.length} lineups, minus injured and suspended players.`,
    starters: placed,
    bench,
  };
}
