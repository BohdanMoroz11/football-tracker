// ESPN scoreboard + summary payloads -> match list and match detail.
import type { GoalMark, H2HGame, Lineup, LineupPlayer, MatchCard, MatchDetail, MatchEvent, MatchState, Odds, PlayerMark, Shot, Side, StatRow, TeamRef } from "../shared/types.ts";
import { espn, soft } from "./espn.ts";
import { LEAGUES, leagueById } from "./leagues.ts";
import { place } from "./formation.ts";
import { matchPerson } from "./fotmob.ts";

const SIDES: Side[] = ["home", "away"];

export const stateOf = (status: any): MatchState => (status?.type?.state === "in" ? "in" : status?.type?.state === "post" ? "post" : "pre");

export function statusText(status: any): string {
  const t = status?.type ?? {};
  if (t.state === "in") return t.name === "STATUS_HALFTIME" ? "HT" : status.displayClock ?? t.shortDetail;
  if (t.state === "post") {
    if (/postponed|canceled|abandoned/i.test(t.name)) return t.description;
    return t.shortDetail ?? "FT"; // FT, AET, FT-Pens
  }
  if (/postponed|canceled/i.test(t.name ?? "")) return t.description;
  return "";
}

export function teamRef(c: any): TeamRef {
  const t = c.team ?? {};
  const rec = Array.isArray(c.records) ? c.records : Array.isArray(c.record) ? c.record : [];
  return {
    id: String(t.id),
    name: t.displayName ?? t.name,
    short: t.shortDisplayName ?? t.displayName,
    abbr: t.abbreviation,
    logo: t.logo ?? t.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`,
    color: (t.color ?? "556070").replace("#", ""),
    altColor: (t.alternateColor ?? "ffffff").replace("#", ""),
    score: c.score,
    shootout: c.shootoutScore != null ? String(c.shootoutScore) : undefined,
    winner: c.winner,
    form: c.form ?? t.form,
    record: rec.find((r: any) => r.type === "total")?.summary,
  };
}

function goalKind(text = ""): GoalMark["kind"] {
  if (/own goal/i.test(text)) return "og";
  if (/penalty/i.test(text)) return "pen";
  return undefined;
}

function card(ev: any, league: string): MatchCard {
  const c = ev.competitions[0];
  const comp = (s: Side) => c.competitors.find((x: any) => x.homeAway === s);
  const sideOf = (teamId: string): Side => (String(comp("home").team.id) === String(teamId) ? "home" : "away");
  const details: any[] = c.details ?? [];
  return {
    id: String(ev.id),
    league,
    date: ev.date,
    state: stateOf(ev.status),
    status: statusText(ev.status),
    home: teamRef(comp("home")),
    away: teamRef(comp("away")),
    venue: c.venue?.fullName ?? c.venue?.displayName,
    round: roundLabel(league, ev.season?.slug),
    note: c.altGameNote && !/^(LALIGA|English Premier League|German Bundesliga)$/i.test(c.altGameNote) ? c.altGameNote : undefined,
    goals: details
      .filter((d) => d.scoringPlay && !d.shootout)
      .map((d) => ({
        // ESPN attributes own goals to the team that benefits.
        side: sideOf(d.team?.id),
        minute: d.clock?.displayValue ?? "",
        player: d.athletesInvolved?.[0]?.shortName ?? "",
        kind: d.ownGoal ? "og" : d.penaltyKick ? "pen" : undefined,
      })),
    redCards: details.filter((d) => d.redCard).map((d) => ({ side: sideOf(d.team?.id), minute: d.clock?.displayValue ?? "", player: d.athletesInvolved?.[0]?.shortName ?? "" })),
  };
}

function roundLabel(league: string, slug?: string) {
  if (league.startsWith("uefa") && slug) return slug.replace(/-/g, " ").replace(/^\w/, (m) => m.toUpperCase());
  return undefined;
}

// ---------- match list ----------

/**
 * Matches around a day. ESPN groups days by US time and, with no date, falls back to the latest matchday,
 * so ask for a three-day window and let the browser keep the ones on the viewer's local day.
 */
export async function getMatches(date: string) {
  const shift = (d: string, n: number) => {
    const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const days = [shift(date, -1), date, shift(date, 1)];
  const leagues = await Promise.all(
    LEAGUES.map(async (l) => {
      const boards = await Promise.all(days.map((d) => soft(espn.scoreboard(l.id, d), `scoreboard ${l.id} ${d}`)));
      const byId = new Map<string, MatchCard>();
      for (const b of boards) for (const e of (b?.events ?? []) as any[]) byId.set(String(e.id), card(e, l.id));
      return { league: l, matches: [...byId.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    }),
  );
  return { date, leagues };
}

// ---------- match detail ----------

const STAT_LABELS: [string, string, boolean?][] = [
  ["possessionPct", "Possession", true],
  ["totalShots", "Shots"],
  ["shotsOnTarget", "On target"],
  ["wonCorners", "Corners"],
  ["accuratePasses", "Accurate passes"],
  ["passPct", "Pass accuracy", true],
  ["totalCrosses", "Crosses"],
  ["totalLongBalls", "Long balls"],
  ["effectiveTackles", "Tackles won"],
  ["interceptions", "Interceptions"],
  ["effectiveClearance", "Clearances"],
  ["blockedShots", "Shots blocked"],
  ["saves", "Saves"],
  ["foulsCommitted", "Fouls"],
  ["offsides", "Offsides"],
  ["yellowCards", "Yellow cards"],
  ["redCards", "Red cards"],
];

function stats(box: any, homeId: string): StatRow[] {
  const teams: any[] = box?.teams ?? [];
  const get = (s: Side) => {
    const t = teams.find((x) => (String(x.team?.id) === homeId) === (s === "home"));
    return new Map<string, any>((t?.statistics ?? []).map((x: any) => [x.name, x]));
  };
  const h = get("home");
  const a = get("away");
  if (!h.size) return [];
  return STAT_LABELS.filter(([k]) => h.has(k)).map(([key, label, pct]) => {
    let hv = Number(h.get(key)?.displayValue ?? 0);
    let av = Number(a.get(key)?.displayValue ?? 0);
    // passPct arrives as 0.7; show whole percentages.
    if (key === "passPct") {
      const hp = Number(h.get("accuratePasses")?.displayValue), ht = Number(h.get("totalPasses")?.displayValue);
      const ap = Number(a.get("accuratePasses")?.displayValue), at = Number(a.get("totalPasses")?.displayValue);
      hv = ht ? Math.round((hp / ht) * 100) : hv * 100;
      av = at ? Math.round((ap / at) * 100) : av * 100;
    }
    return { key, label, home: hv, away: av, pct, display: pct ? [`${Math.round(hv)}%`, `${Math.round(av)}%`] : undefined };
  });
}

const emptyMarks = (): PlayerMark => ({ goals: [], ownGoals: [], pens: [], assists: [] });

const roleOf = (pos = ""): LineupPlayer["role"] =>
  pos === "G" || pos === "GK" ? "G" : /^(CD|LB|RB|D|LWB|RWB|SW)/.test(pos) ? "D" : /^(CF|F|LF|RF|ST|LW|RW)/.test(pos) ? "F" : "M";

function lineupFrom(r: any): Lineup {
  const players: LineupPlayer[] = (r?.roster ?? []).map((p: any) => {
    const st: Record<string, number> = {};
    for (const s of p.stats ?? []) if (s.value) st[s.name] = s.value;
    const pos = p.position?.abbreviation;
    return {
      id: String(p.athlete.id),
      name: p.athlete.displayName,
      short: p.athlete.shortName ?? p.athlete.displayName,
      jersey: p.jersey,
      pos: pos === "SUB" ? undefined : pos,
      role: roleOf(pos === "SUB" ? undefined : pos),
      starter: !!p.starter,
      marks: emptyMarks(),
      stats: st,
      place: Number(p.formationPlace) || undefined,
    } as LineupPlayer & { place?: number };
  });
  const starters = place(players.filter((p) => p.starter) as (LineupPlayer & { place?: number })[], r?.formation).map(({ place: _p, ...rest }: any) => rest);
  return {
    status: starters.length >= 11 ? "official" : "none",
    formation: r?.formation,
    starters,
    bench: players.filter((p) => !p.starter).map(({ place: _p, ...rest }: any) => rest),
    kit: r?.uniform?.color ? { color: r.uniform.color, alt: r.uniform.alternateColor } : undefined,
    unavailable: [],
  };
}

function eventType(type = "", text = ""): MatchEvent["type"] | undefined {
  if (type === "own-goal" || /own goal/i.test(text)) return "own-goal";
  if (type.startsWith("penalty---scored")) return "pen-goal";
  if (type.startsWith("penalty---missed") || type.startsWith("penalty---saved")) return "pen-miss";
  if (type.startsWith("goal")) return "goal";
  if (type === "yellow-card") return "yellow";
  if (type === "red-card") return /second yellow/i.test(text) ? "second-yellow" : "red";
  if (type === "substitution") return "sub";
  if (type.startsWith("var") || type === "deleted-after-review") return "var";
  if (["halftime", "end-regular-time", "start-extra-time", "end-extra-time", "start-shootout"].includes(type)) return "period";
  return undefined;
}

const minuteSort = (clock: any, period?: number) => {
  const v = Number(clock?.value ?? 0);
  // Stoppage time keeps the base minute in value; nudge by period so 45'+3' sorts before 46'.
  return v + (period ?? 0) * 0.001;
};

function events(keyEvents: any[], homeId: string, lineups: Record<Side, Lineup>): MatchEvent[] {
  const out: MatchEvent[] = [];
  let hs = 0;
  let as = 0;
  const all = [...lineups.home.starters, ...lineups.home.bench, ...lineups.away.starters, ...lineups.away.bench];
  const idByName = new Map(all.map((p) => [p.name, p.id]));
  for (const k of keyEvents ?? []) {
    const type = eventType(k.type?.type, k.text);
    if (!type) continue;
    const side: Side | undefined = k.team?.id ? (String(k.team.id) === homeId ? "home" : "away") : undefined;
    const p0 = k.participants?.[0]?.athlete;
    const p1 = k.participants?.[1]?.athlete;
    const minute = k.clock?.displayValue ?? "";
    const e: MatchEvent = { minute, sort: minuteSort(k.clock, k.period?.number), side, type, text: k.type?.text ?? "", detail: k.text, player: p0?.displayName, playerId: p0?.id ? String(p0.id) : idByName.get(p0?.displayName), other: p1?.displayName };
    if (type === "goal" || type === "pen-goal" || type === "own-goal") {
      // ESPN credits an own goal to the team that benefits.
      if (side === "home") hs++;
      else as++;
      e.score = `${hs}-${as}`;
      const assist = /Assisted by ([^.]+?)(?: with| following|\.)/.exec(k.text ?? "")?.[1];
      if (type !== "own-goal") e.other = assist;
    }
    if (type === "period") e.text = k.type?.text === "Halftime" ? "Half-time" : k.type?.text;
    out.push(e);
  }
  return out;
}

/** Fold goals, cards and substitutions into each lineup player's marks (and link who replaced whom). */
function markPlayers(lineups: Record<Side, Lineup>, evs: MatchEvent[]) {
  // Commentary spells names its own way ("Alex" vs "Álex"), so match loosely, preferring the event's team.
  const squads = (side?: Side) => (side ? [...lineups[side].starters, ...lineups[side].bench] : SIDES.flatMap((s) => [...lineups[s].starters, ...lineups[s].bench]));
  const byName = { get: (name: string, side?: Side) => matchPerson(squads(side), name) ?? matchPerson(squads(), name) };
  const find = (id?: string, name?: string, side?: Side) => squads().find((p) => p.id === id) ?? (name ? byName.get(name, side) : undefined);
  for (const e of evs) {
    const p = find(e.playerId, e.player, e.type === "own-goal" ? undefined : e.side);
    if (e.type === "goal") {
      p?.marks.goals.push(e.minute);
      const a = e.other ? byName.get(e.other, e.side) : undefined;
      a?.marks.assists.push(e.minute);
    }
    if (e.type === "pen-goal") p?.marks.pens.push(e.minute), p?.marks.goals.push(e.minute);
    if (e.type === "own-goal") p?.marks.ownGoals.push(e.minute);
    if (e.type === "yellow" && p) p.marks.yellow = e.minute;
    if ((e.type === "red" || e.type === "second-yellow") && p) p.marks.red = e.minute;
    if (e.type === "sub") {
      // participants: [player on, player off]
      const off = e.other ? byName.get(e.other, e.side) : undefined;
      if (p) p.marks.subIn = e.minute;
      if (off) off.marks.subOut = e.minute;
      if (p && off) {
        p.replaces = off.id;
        off.replacedBy = p.id;
      }
    }
  }
}

function shotsFrom(commentary: any[], homeName: string, awayName: string, homeShort: string): Shot[] {
  const out: Shot[] = [];
  for (const c of commentary ?? []) {
    const p = c.play;
    const t = p?.type?.type ?? "";
    const isGoal = !!p?.scoringPlay && !/own goal/i.test(p?.text ?? "");
    const outcome: Shot["outcome"] | undefined = isGoal ? "goal" : t === "shot-on-target" ? "on" : t === "shot-off-target" ? "off" : t === "shot-blocked" ? "blocked" : t.startsWith("penalty---saved") ? "on" : t.startsWith("penalty---missed") ? "off" : undefined;
    if (!outcome || p.fieldPositionX == null) continue;
    const team = p.team?.displayName ?? "";
    const side: Side = team === homeName || team === homeShort || (team !== awayName && (p.text ?? "").includes(`(${homeName})`)) ? "home" : "away";
    out.push({ side, minute: p.clock?.displayValue ?? "", sort: minuteSort(p.clock, p.period?.number), player: p.participants?.[0]?.athlete?.displayName, x: p.fieldPositionX, y: p.fieldPositionY, outcome, text: p.text });
  }
  return out;
}

/**
 * A pressure curve from the commentary feed: shots, corners and goals push the line toward the attacking team,
 * smoothed over a few minutes. ESPN has no official momentum metric, so this is our own estimate.
 */
function momentum(commentary: any[], homeId: string, homeName: string, maxMinute: number) {
  const weight: Record<string, number> = { "shot-on-target": 3, "shot-off-target": 1.6, "shot-blocked": 1.4, "corner-awarded": 1.2, offside: 0.5, "free-kick-won": 0.4 };
  const raw = new Array(Math.max(1, Math.ceil(maxMinute)) + 1).fill(0);
  for (const c of commentary ?? []) {
    const p = c.play;
    if (!p) continue;
    let w = weight[p.type?.type ?? ""] ?? 0;
    if (p.scoringPlay) w = 5;
    if (!w) continue;
    const minute = Math.min(raw.length - 1, Math.floor(Number(p.clock?.value ?? 0) / 60));
    const isHome = String(p.team?.id ?? "") === homeId || p.team?.displayName === homeName;
    raw[minute] += isHome ? w : -w;
  }
  const out: { minute: number; value: number }[] = [];
  for (let m = 0; m < raw.length; m++) {
    let v = 0;
    for (let k = 0; k < 6 && m - k >= 0; k++) v += raw[m - k] * (1 - k / 6);
    out.push({ minute: m, value: Math.max(-10, Math.min(10, v)) });
  }
  return out;
}

/** American moneyline -> implied probability. */
const implied = (ml?: number) => (ml == null || !isFinite(ml) ? undefined : ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100));
const fmtMl = (ml?: number) => (ml == null ? undefined : ml > 0 ? `+${ml}` : String(ml));

function odds(pc: any): Odds | undefined {
  const o = pc?.[0];
  if (!o) return undefined;
  const hm = o.homeTeamOdds?.moneyLine, am = o.awayTeamOdds?.moneyLine, dm = o.drawOdds?.moneyLine;
  const h = implied(hm), a = implied(am), d = implied(dm);
  if (h == null || a == null || d == null) return undefined;
  const sum = h + a + d; // strip the bookmaker margin
  return {
    provider: o.provider?.name ?? "",
    home: (h / sum) * 100,
    draw: (d / sum) * 100,
    away: (a / sum) * 100,
    overUnder: o.overUnder,
    raw: { home: fmtMl(hm), draw: fmtMl(dm), away: fmtMl(am) },
  };
}

function h2h(series: any[]): MatchDetail["h2h"] {
  const s = series?.find((x) => x.type === "head-to-head") ?? series?.[0];
  if (!s) return { games: [] };
  const games: H2HGame[] = (s.events ?? [])
    .filter((e: any) => e.statusType?.completed ?? e.status === "post")
    .map((e: any) => {
      const h = e.competitors.find((c: any) => c.homeAway === "home");
      const a = e.competitors.find((c: any) => c.homeAway === "away");
      return {
        id: String(e.id),
        date: e.date,
        home: h.team.displayName,
        away: a.team.displayName,
        homeId: String(h.team.id),
        awayId: String(a.team.id),
        score: `${h.score}-${a.score}`,
        winnerId: h.winner ? String(h.team.id) : a.winner ? String(a.team.id) : undefined,
      };
    });
  return { summary: s.summary, games };
}

export async function getMatchRaw(league: string, id: string) {
  return espn.summary(league, id);
}

export function mapMatch(league: string, s: any): MatchDetail {
  const comp = s.header.competitions[0];
  const c = (side: Side) => comp.competitors.find((x: any) => x.homeAway === side);
  const home = teamRef(c("home"));
  const away = teamRef(c("away"));
  const status = comp.status;
  const lineups = Object.fromEntries(
    SIDES.map((side) => [side, lineupFrom((s.rosters ?? []).find((r: any) => r.homeAway === side))]),
  ) as Record<Side, Lineup>;
  const evs = events(s.keyEvents ?? [], home.id, lineups);
  markPlayers(lineups, evs);
  const clockSeconds = Number(status?.clock ?? 0);
  const state = stateOf(status);
  const maxMinute = state === "pre" ? 0 : Math.max(90, Math.ceil(clockSeconds / 60), ...((s.commentary ?? []) as any[]).map((x) => Math.ceil(Number(x.play?.clock?.value ?? 0) / 60)));
  const gi = s.gameInfo ?? {};
  const goals: GoalMark[] = evs
    .filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "own-goal")
    .map((e) => ({ side: e.side ?? "home", minute: e.minute, player: e.player ?? "", kind: e.type === "own-goal" ? "og" : e.type === "pen-goal" ? "pen" : goalKind(e.text) }));
  return {
    id: String(s.header.id),
    league,
    leagueInfo: leagueById(league),
    date: comp.date,
    state,
    status: statusText(status),
    home,
    away,
    venue: gi.venue?.fullName,
    venueInfo: gi.venue ? { name: gi.venue.fullName, city: gi.venue.address?.city, attendance: gi.attendance || undefined } : undefined,
    referee: gi.officials?.[0] ? { name: gi.officials[0].displayName ?? gi.officials[0].fullName } : undefined,
    round: roundLabel(league, s.header.season?.slug ?? s.header.season?.type?.slug),
    goals,
    redCards: evs.filter((e) => e.type === "red" || e.type === "second-yellow").map((e) => ({ side: e.side ?? "home", minute: e.minute, player: e.player ?? "" })),
    odds: odds(s.pickcenter ?? s.odds),
    lineups,
    events: evs,
    stats: stats(s.boxscore, home.id),
    shots: shotsFrom(s.commentary ?? [], home.name, away.name, home.short),
    momentum: state === "pre" ? [] : momentum(s.commentary ?? [], home.id, home.name, maxMinute),
    h2h: h2h(s.seasonseries ?? []),
    commentary: ((s.commentary ?? []) as any[])
      .filter((x) => x.text)
      .map((x) => ({ minute: x.time?.displayValue ?? "", text: x.text, type: x.play?.type?.type }))
      .reverse(),
    clockSeconds,
    period: status?.period,
    insights: [],
    momentumSource: state === "pre" ? undefined : "estimate",
  };
}
