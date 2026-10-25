// Formations are messy: sources disagree, teams change shape week to week, players fill unusual slots,
// and substitutions reshape a team mid-game. This collects the evidence so the UI can say so.
import type { LineupPlayer, MatchDetail, ShapeInfo, Side } from "../shared/types.ts";
import { TTL, mapLimit, soft } from "./espn.ts";
import { fotmob, positionLabel } from "./fotmob.ts";
import { coachLore } from "./lore.ts";
import { compShort } from "./leagues.ts";

const SIDES: Side[] = ["home", "away"];

// Families decide what counts as "out of position": a CM at CDM is normal, a CM at right-back isn't.
const FAMILY: Record<string, string> = {
  GK: "GK", CB: "CB", RB: "FB", LB: "FB", RWB: "WB", LWB: "WB", CDM: "DM", CM: "CM", RM: "WM", LM: "WM", CAM: "AM", RW: "W", LW: "W", ST: "ST",
};
const NEAR: [string, string][] = [["FB", "WB"], ["DM", "CM"], ["CM", "AM"], ["WM", "W"], ["WM", "WB"], ["AM", "W"], ["AM", "ST"], ["W", "ST"]];
const near = (a: string, b: string) => a === b || NEAR.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const flank = (pos: string) => (/^R/.test(pos) ? "R" : /^L/.test(pos) ? "L" : "");
const LINE: Record<string, number> = { GK: 0, CB: 1, FB: 1, WB: 1.5, DM: 2, CM: 2, WM: 2, AM: 3, W: 3, ST: 3 };

const norm = (f?: string) => (f ?? "").replace(/\s/g, "");

/** A club's formations in its last few matches, with each starter's slot (FotMob). */
async function recentShapes(fmTeamId: number, before: string) {
  const team = await fotmob.team(fmTeamId);
  const fixtures: any[] = team?.fixtures?.allFixtures?.fixtures ?? [];
  const done = fixtures
    .filter((f) => f.status?.finished && !f.status?.cancelled && Date.parse(f.status.utcTime) < Date.parse(before) - 3 * 3600_000)
    .sort((a, b) => Date.parse(b.status.utcTime) - Date.parse(a.status.utcTime))
    .slice(0, 6);
  const matches = await mapLimit(done, 3, async (f) => {
    const d = await soft(fotmob.match(f.id, TTL.day), `fotmob match ${f.id}`);
    const lu = d?.content?.lineup;
    const t = lu?.homeTeam?.id === fmTeamId ? lu.homeTeam : lu?.awayTeam?.id === fmTeamId ? lu.awayTeam : undefined;
    const home = f.home?.id === fmTeamId;
    const mine = home ? f.home?.score : f.away?.score;
    const theirs = home ? f.away?.score : f.home?.score;
    return {
      matchId: String(f.id),
      date: f.status.utcTime as string,
      opponent: f.opponent?.name ?? "",
      comp: compShort(f.tournament?.name ?? ""),
      home,
      formation: t?.formation || undefined,
      score: mine != null ? `${mine}-${theirs}` : undefined,
      result: (mine == null ? undefined : mine > theirs ? "W" : mine < theirs ? "L" : "D") as "W" | "D" | "L" | undefined,
      starters: ((t?.starters ?? []) as any[]).map((p) => ({ fmId: p.id as number, slot: positionLabel(p.positionId) })),
    };
  });
  // Natural positions per player, from the squad list ("CB,RB").
  const natural = new Map<number, string[]>();
  for (const g of team?.squad?.squad ?? []) for (const mem of g.members ?? []) if (mem.positionIdsDesc) natural.set(mem.id, String(mem.positionIdsDesc).split(",").map((x) => x.trim()).filter(Boolean));
  return { matches, natural };
}

function familyOf(positions: string[] = []) {
  return positions.map((p) => FAMILY[p]).find(Boolean);
}

/** In-game reshapes we can infer: who came off and on (by natural position), and red cards. */
function changes(m: MatchDetail, side: Side, natural: Map<number, string[]>): ShapeInfo["changes"] {
  const out: ShapeInfo["changes"] = [];
  const l = m.lineups[side];
  const all = [...l.starters, ...l.bench];
  const pos = (p?: LineupPlayer) => (p?.fmId ? natural.get(p.fmId) : undefined) ?? (p?.slot ? [p.slot] : undefined);
  for (const e of m.events) {
    if (e.side !== side) continue;
    if (e.type === "red" || e.type === "second-yellow") out.push({ minute: e.minute, text: `Down to ten after ${e.player}'s red card: expect a back four with one striker, or everyone behind the ball.` });
    if (e.type !== "sub") continue;
    const on = all.find((p) => p.id === e.playerId) ?? all.find((p) => p.name === e.player);
    const off = all.find((p) => p.name === e.other);
    const fOn = familyOf(pos(on)), fOff = familyOf(pos(off));
    if (!fOn || !fOff || near(fOn, fOff)) continue;
    const dOn = LINE[fOn], dOff = LINE[fOff];
    // Only changes that plausibly reshape the team: across two lines, an extra centre-back, or a second striker.
    const backFive = fOn === "CB" && dOff >= 2;
    const twoUp = fOn === "ST" && dOff <= 2;
    if (Math.abs(dOn - dOff) < 1.5 && !backFive && !twoUp) continue;
    const who = (f: string) => ({ GK: "goalkeeper", CB: "centre-back", FB: "full-back", WB: "wing-back", DM: "holding midfielder", CM: "midfielder", WM: "wide midfielder", AM: "attacking midfielder", W: "winger", ST: "striker" })[f] ?? f;
    // Score at the moment of the change, not the final one.
    const goalsBy = (who: Side) => m.events.filter((g) => (g.type === "goal" || g.type === "pen-goal" || g.type === "own-goal") && g.side === who && g.sort < e.sort).length;
    const lead = goalsBy(side) - goalsBy(side === "home" ? "away" : "home");
    const why = dOn < dOff ? (lead > 0 ? "protecting the lead" : "tightening up") : lead < 0 ? "chasing the game" : "pushing for more";
    const extra = backFive ? " Possibly a switch to a back five." : twoUp ? " Probably two up front now." : "";
    out.push({ minute: e.minute, text: `${e.player} (${who(fOn)}) on for ${e.other} (${who(fOff)}): ${why}.${extra}` });
  }
  return out;
}

export async function getShapes(m: MatchDetail): Promise<Partial<Record<Side, ShapeInfo>>> {
  const out: Partial<Record<Side, ShapeInfo>> = {};
  await Promise.all(
    SIDES.map(async (side) => {
      const l = m.lineups[side];
      const fmTeamId = m.fm?.teamIds[side];
      const rec = fmTeamId ? await soft(recentShapes(fmTeamId, m.date), `shapes ${side}`) : undefined;
      const matches = rec?.matches ?? [];
      const natural = rec?.natural ?? new Map<number, string[]>();

      const countMap = new Map<string, number>();
      for (const r of matches) if (r.formation) countMap.set(r.formation, (countMap.get(r.formation) ?? 0) + 1);
      const counts = [...countMap.entries()].map(([formation, count]) => ({ formation, count })).sort((a, b) => b.count - a.count);
      const known = counts.reduce((s, c) => s + c.count, 0);
      const usual = counts[0]?.formation;
      // Settled when one shape covers 80%+ of recent matches; variable when one still covers half; else fluid.
      const top = known ? counts[0].count / known : 0;
      const fluidity = known >= 3 ? (top >= 0.8 ? "fixed" : top >= 0.5 ? "variable" : "fluid") : undefined;

      const src = l.formationSources ?? {};
      const disagree = !!src.espn && !!src.fotmob && norm(src.espn) !== norm(src.fotmob);

      const outOfPosition: ShapeInfo["outOfPosition"] = [];
      const players: ShapeInfo["players"] = {};
      for (const p of l.starters) {
        const nat = (p.fmId ? natural.get(p.fmId) : undefined) ?? [];
        const recent = new Map<string, number>();
        for (const r of matches) {
          const s = r.starters.find((x) => x.fmId === p.fmId)?.slot;
          if (s) recent.set(s, (recent.get(s) ?? 0) + 1);
        }
        players[p.id] = { natural: nat, recent: [...recent.entries()].map(([slot, count]) => ({ slot, count })).sort((a, b) => b.count - a.count) };
        if (!p.slot || !nat.length || nat.includes(p.slot) || l.status !== "official") continue;
        const fSlot = FAMILY[p.slot];
        const fams = nat.map((n) => FAMILY[n]).filter(Boolean);
        if (!fSlot || !fams.length) continue;
        if (fams.includes(fSlot)) {
          // Same role, other side of the pitch (a left winger on the right is often deliberate: cutting inside).
          if (flank(p.slot) && nat.every((n) => flank(n) && flank(n) !== flank(p.slot!))) outOfPosition.push({ playerId: p.id, name: p.name, slot: p.slot, natural: nat, kind: "flank" });
        } else if (!fams.some((f) => near(f, fSlot))) {
          outOfPosition.push({ playerId: p.id, name: p.name, slot: p.slot, natural: nat, kind: "position" });
        }
      }

      const coachName = l.coach?.name;
      const shapes = coachName ? coachLore(coachName)?.shapes : undefined;
      out[side] = {
        today: l.formation,
        sources: src,
        disagree,
        recent: matches.map(({ starters: _s, ...r }) => r),
        counts,
        usual,
        changedFromUsual: !!l.formation && !!usual && known >= 3 && norm(l.formation) !== norm(usual) && l.status === "official",
        fluidity,
        outOfPosition,
        players,
        changes: changes(m, side, natural),
        coach: shapes,
      };
    }),
  );
  return out;
}
