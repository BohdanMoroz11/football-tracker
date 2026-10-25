// Layers FotMob's match data over the ESPN-based MatchDetail. Everything here is optional: if FotMob
// can't be matched or is down, the page still works from ESPN alone.
import type { Absentee, Lineup, LineupPlayer, MatchDetail, Shot, Side, StatRow } from "../shared/types.ts";
import { findMatchId, fmPhoto, fotmob, matchPerson } from "./fotmob.ts";
import { TTL, soft } from "./espn.ts";

const SIDES: Side[] = ["home", "away"];

export async function enrichMatch(m: MatchDetail): Promise<MatchDetail> {
  const fmId = await soft(findMatchId(m.league, m.date, m.home.name, m.away.name), "fotmob find");
  if (!fmId) return m;
  // Finished matches don't change; live ones refresh with the page.
  const d = await soft(fotmob.match(fmId, m.state === "post" ? TTL.medium : TTL.live), "fotmob match");
  if (!d?.content) return m;
  const c = d.content;
  const teams = d.header?.teams ?? [];
  m.fm = { matchId: fmId, teamIds: { home: teams[0]?.id, away: teams[1]?.id } };
  const round = d.general?.leagueRoundName;
  if (!m.round && round) m.round = /^\d+$/.test(String(round)) ? `Matchday ${round}` : String(round);

  const lu = c.lineup;
  const ps: Record<string, any> = c.playerStats ?? {};
  for (const side of SIDES) {
    const t = side === "home" ? lu?.homeTeam : lu?.awayTeam;
    if (!t) continue;
    enrichLineup(m.lineups[side], t, ps, lu?.lineupType);
  }

  // Match xG + extra stat rows FotMob has and ESPN doesn't.
  const fmStats = new Map<string, any[]>();
  for (const grp of c.stats?.Periods?.All?.stats ?? []) for (const s of grp.stats ?? []) if (s.stats?.[0] != null && !fmStats.has(s.title)) fmStats.set(s.title, s.stats);
  const xg = fmStats.get("Expected goals (xG)");
  if (xg) m.xg = { home: Number(xg[0]), away: Number(xg[1]) };
  const extra: [string, string, string][] = [
    ["Expected goals (xG)", "xg", "Expected goals (xG)"],
    ["Big chances", "bigChances", "Big chances"],
    ["Touches in opposition box", "boxTouches", "Touches in their box"],
    ["Duels won", "duels", "Duels won"],
  ];
  const rows: StatRow[] = [];
  for (const [title, key, label] of extra) {
    const v = fmStats.get(title);
    if (!v) continue;
    const h = parseFloat(String(v[0])), a = parseFloat(String(v[1]));
    if (isNaN(h) || isNaN(a)) continue;
    rows.push({ key, label, home: h, away: a, display: key === "xg" ? [h.toFixed(2), a.toFixed(2)] : undefined });
  }
  if (rows.length) {
    const at = m.stats.findIndex((r) => r.key === "possessionPct") + 1;
    m.stats.splice(at, 0, ...rows);
  }

  // FotMob's momentum is real pressure data; prefer it over our commentary estimate.
  const mom = c.momentum?.main?.data;
  if (Array.isArray(mom) && mom.length > 3) {
    m.momentum = mom.map((p: any) => ({ minute: Number(p.minute), value: Math.max(-10, Math.min(10, Number(p.value) / 10)) }));
    m.momentumSource = "fotmob";
  }

  const shots = c.shotmap?.shots;
  if (Array.isArray(shots) && shots.length) {
    m.shots = shots.map((s: any): Shot => {
      const side: Side = s.teamId === m.fm!.teamIds.home ? "home" : "away";
      const outcome: Shot["outcome"] = s.eventType === "Goal" && !s.isOwnGoal ? "goal" : s.isBlocked ? "blocked" : s.isOnTarget ? "on" : "off";
      return {
        side,
        minute: `${s.min}'${s.minAdded ? `+${s.minAdded}'` : ""}`,
        sort: Number(s.min) * 60 + Number(s.minAdded ?? 0),
        player: s.playerName,
        x: (Number(s.x) / 105) * 100,
        y: (Number(s.y) / 68) * 100,
        outcome,
        xg: s.expectedGoals,
        text: [s.situation, s.shotType].filter(Boolean).join(", ").replace(/([a-z])([A-Z])/g, "$1 $2"),
      };
    });
  }

  const info = c.matchFacts?.infoBox ?? {};
  const ref = info.Referee;
  if (ref?.text) {
    const stat = (type: string) => (ref.stats ?? []).find((s: any) => s.type === type);
    const games = stat("matches")?.value;
    const reds = stat("redCards")?.value;
    const pens = stat("penalties")?.value;
    m.referee = {
      name: ref.text,
      country: ref.country,
      matches: games,
      yellowsPerGame: stat("yellowCards")?.value,
      redsPerGame: games && reds != null ? reds / games : undefined,
      pensPerGame: games && pens != null ? pens / games : undefined,
    };
  }
  if (info.Stadium?.name) {
    m.venueInfo = { ...(m.venueInfo ?? { name: info.Stadium.name }), city: info.Stadium.city ?? m.venueInfo?.city, capacity: info.Stadium.capacity || undefined, attendance: info.Attendance || m.venueInfo?.attendance };
  }
  const w = c.weather;
  if (w?.temperature != null && m.state !== "post") {
    m.weather = { tempC: Math.round(w.temperature), desc: w.description ?? "", windKmh: w.windSpeed != null ? Math.round(w.windSpeed * 3.6) : undefined, rainPct: w.precipChance, icon: weatherIcon(w.description ?? "", w.cloudCover) };
  }

  m.insights = ((c.matchFacts?.insights ?? []) as any[])
    .filter((i) => i.text)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 8)
    .map((i) => ({ text: i.text, side: i.teamId === m.fm!.teamIds.home ? "home" : i.teamId === m.fm!.teamIds.away ? "away" : undefined }));

  const sum = c.h2h?.summary;
  if (Array.isArray(sum) && sum.length === 3) m.h2hAllTime = { home: sum[0], draw: sum[1], away: sum[2] };

  const potm = c.matchFacts?.playerOfTheMatch?.id;
  if (potm) for (const s of SIDES) for (const p of [...m.lineups[s].starters, ...m.lineups[s].bench]) if (p.fmId === potm) p.potm = true;
  return m;
}

function weatherIcon(desc: string, cloud?: number): NonNullable<MatchDetail["weather"]>["icon"] {
  const d = desc.toLowerCase();
  if (/thunder|storm/.test(d)) return "storm";
  if (/snow|sleet/.test(d)) return "snow";
  if (/rain|shower|drizzle/.test(d)) return "rain";
  if (/fog|mist/.test(d)) return "fog";
  if (/overcast|cloudy/.test(d) && (cloud ?? 100) > 70) return "cloud";
  if (/partly|cloud/.test(d)) return "partly";
  return "sun";
}

const roleFromFm = (positionId?: number): LineupPlayer["role"] | undefined => {
  // FotMob position ids: 11 keeper, 30s-50s defenders, 60s-80s midfield, 100s+ attack (roughly by depth band).
  if (positionId == null) return undefined;
  if (positionId === 11 || positionId === 0) return "G";
  const band = Math.floor(positionId / 10);
  if (band <= 5) return "D";
  if (band <= 8) return "M";
  return "F";
};

function enrichLineup(l: Lineup, t: any, ps: Record<string, any>, lineupType?: string) {
  const all = [...l.starters, ...l.bench];
  const fmPlayers: any[] = [...(t.starters ?? []), ...(t.subs ?? [])];
  for (const fp of fmPlayers) {
    const p = matchPerson(all, fp.name, fp.shirtNumber);
    if (!p) continue;
    p.fmId = fp.id;
    p.photo = fmPhoto(fp.id);
    p.age = fp.age;
    p.nationality = fp.countryName;
    p.marketValue = fp.marketValue;
    p.seasonRating = fp.performance?.seasonRating;
    const st = ps[String(fp.id)];
    const top = st?.stats?.[0]?.stats ?? {};
    const num = (k: string) => {
      const v = top[k]?.stat?.value;
      return typeof v === "number" ? v : undefined;
    };
    const rating = num("FotMob rating") ?? fp.performance?.rating;
    if (rating) p.rating = rating;
    const fm: Record<string, number> = {};
    for (const [k, key] of [["Minutes played", "min"], ["Expected goals (xG)", "xg"], ["Expected assists (xA)", "xa"], ["Chances created", "chances"], ["Accurate passes", "passes"], ["Total shots", "shots"]] as const) {
      const v = num(k);
      if (v != null) fm[key] = v;
    }
    if (Object.keys(fm).length) p.fm = fm;
  }

  // FotMob's layout reads the real shape better than ESPN's formation codes (e.g. a 4-3-3 that is really a 4-2-3-1).
  const fmStarters: any[] = t.starters ?? [];
  if (l.status === "official" && fmStarters.length === 11 && t.formation) {
    const pairs = fmStarters.map((fp) => [fp, l.starters.find((p) => p.fmId === fp.id)] as const);
    if (pairs.every(([fp, p]) => p && fp.horizontalLayout)) {
      l.formation = t.formation;
      for (const [fp, p] of pairs) {
        p!.x = Math.min(0.9, Math.max(0.04, fp.horizontalLayout.x));
        p!.y = fp.horizontalLayout.y;
      }
    }
  }

  // No official XI from ESPN but FotMob has one (or its own prediction): adopt it.
  if (l.status !== "official" && fmStarters.length === 11 && (lineupType === "standard" || lineupType === "predicted")) {
    l.status = lineupType === "standard" ? "official" : "probable";
    l.formation = t.formation || l.formation;
    l.basis = lineupType === "predicted" ? "FotMob's predicted lineup" : undefined;
    l.starters = fmStarters.map((fp) => fmToLineup(fp, true, l));
    l.bench = (t.subs ?? []).map((fp: any) => fmToLineup(fp, false, l));
  }

  if (t.coach?.name) l.coach = { name: t.coach.name, fmId: t.coach.id, photo: fmPhoto(t.coach.id), age: t.coach.age, country: t.coach.countryName };
  if (t.rating) l.rating = Number(t.rating);
  if (t.averageStarterAge) l.avgAge = Number(t.averageStarterAge);
  if (t.totalStarterMarketValue) l.value = Number(t.totalStarterMarketValue);
  l.unavailable = ((t.unavailable ?? []) as any[]).map((u): Absentee => {
    const type = u.unavailability?.type ?? "";
    const ret = u.unavailability?.expectedReturn as string | undefined;
    return {
      name: u.name,
      fmId: u.id,
      photo: fmPhoto(u.id),
      status: /suspen|card/i.test(type) ? "suspended" : /doubt/i.test(ret ?? "") ? "doubt" : "out",
      reason: type === "injury" ? "Injury" : /suspen|card/i.test(type) ? "Suspended" : type ? type[0].toUpperCase() + type.slice(1) : undefined,
      returns: ret && !/doubtful/i.test(ret) ? ret : undefined,
      role: roleFromFm(u.positionId),
      seasonRating: u.performance?.seasonRating,
      marketValue: u.marketValue,
    };
  });
}

/** A FotMob lineup player as ours, keeping ESPN ids where the player can be matched (so the player sheet works). */
function fmToLineup(fp: any, starter: boolean, l: Lineup): LineupPlayer {
  const known = matchPerson([...l.starters, ...l.bench], fp.name, fp.shirtNumber);
  const hl = fp.horizontalLayout;
  return {
    ...(known ?? {}),
    id: known?.id ?? `fm${fp.id}`,
    name: known?.name ?? fp.name,
    short: known?.short ?? fp.lastName ?? fp.name,
    jersey: fp.shirtNumber ?? known?.jersey,
    role: known?.role ?? roleFromFm(fp.positionId) ?? "M",
    starter,
    // FotMob lays out the home side left-to-right; its y runs top-to-bottom, which is the team's left at the top.
    x: starter && hl ? Math.min(0.9, Math.max(0.04, hl.x)) : undefined,
    y: starter && hl ? hl.y : undefined,
    marks: known?.marks ?? { goals: [], ownGoals: [], pens: [], assists: [] },
    fmId: fp.id,
    photo: fmPhoto(fp.id),
    age: fp.age,
    nationality: fp.countryName,
    marketValue: fp.marketValue,
    seasonRating: fp.performance?.seasonRating,
  };
}
