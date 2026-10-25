import { useMemo, useState } from "react";
import type { Absentee, LineupPlayer, MatchDetail, Side, SquadPlayer, TeamDetail } from "../../../shared/types";
import { accent, euros, go, ordinal, playerHash, relDays, tenure, tint, useSize, yearsUntil } from "../lib";
import { tip } from "../glossary";
import { Crest, FormPills, Kit, Modal, Photo, RankNote, Rating, Term } from "./ui";
import { CardIcon, kitOf } from "./Pitch";
import { CoachModal } from "./CoachModal";
import { ClubModal } from "./ClubModal";

export type NumbersMode = "match" | "season";

export function ClubPanel({ m, side, team, mode }: { m: MatchDetail; side: Side; team?: TeamDetail; mode: NumbersMode }) {
  const [coachOpen, setCoachOpen] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  const ref = m[side];
  const color = accent(ref.color, ref.altColor);
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-stand ring-1 ring-rule @container" style={{ ["--team" as string]: color }}>
      <ClubHeader m={m} side={side} team={team} onClub={() => setClubOpen(true)} />
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 pb-3 pt-2.5">
        <div className="grid shrink-0 gap-2.5 @md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <CoachCard m={m} side={side} team={team} onOpen={() => setCoachOpen(true)} />
          <LoadCard team={team} />
        </div>
        {team && team.profile.length > 0 && <Profile team={team} />}
        <Squad m={m} side={side} team={team} mode={mode} />
      </div>
      {coachOpen && team?.coach && <CoachModal team={team} onClose={() => setCoachOpen(false)} />}
      {clubOpen && team && <ClubModal team={team} m={m} onClose={() => setClubOpen(false)} />}
    </section>
  );
}

function ClubHeader({ m, side, team, onClub }: { m: MatchDetail; side: Side; team?: TeamDetail; onClub: () => void }) {
  const ref = m[side];
  const st = team?.standing;
  const results = team?.results.slice(0, 5).reverse() ?? [];
  return (
    <header className="relative shrink-0 overflow-hidden border-b border-rule px-3 py-2.5">
      {/* A wash of the club color from the crest side: identity without decoration. */}
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `linear-gradient(100deg, ${tint(ref.color)} 0%, transparent 65%)` }} />
      <div className="relative flex items-center gap-3">
        <Crest src={ref.logo} className="size-11 drop-shadow" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-display text-[26px] font-extrabold leading-none tracking-tight">{ref.name}</h2>
            <span className="font-ui text-xs text-mute">{side === "home" ? "Home" : "Away"}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-[13px] text-chalk/80">
            {st ? (
              <span className="tnum" data-tip={`${st.w} wins, ${st.d} draws, ${st.l} losses · goals ${st.gf}-${st.ga}${st.zone ? `\nZone: ${st.zone.label}` : ""}`}>
                <b className="font-semibold text-chalk">{ordinal(st.rank)}</b> · {st.pts} pts · {st.w}-{st.d}-{st.l}
                {st.zone && <span className="ml-1.5 inline-block size-2 rounded-full align-middle" style={{ background: st.zone.color }} />}
              </span>
            ) : (
              ref.record && <span className="tnum">{ref.record}</span>
            )}
            {results.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Term k="form" className="text-mute">Form</Term>
                <FormPills results={results} size="sm" />
              </span>
            )}
          </div>
        </div>
        <button onClick={onClub} disabled={!team} className="shrink-0 rounded-lg px-2.5 py-1 font-ui text-[13px] font-semibold text-chalk/90 ring-1 ring-rule hover:bg-terrace disabled:opacity-40">
          Club
        </button>
      </div>
    </header>
  );
}

function CoachCard({ m, side, team, onOpen }: { m: MatchDetail; side: Side; team?: TeamDetail; onOpen: () => void }) {
  const c = team?.coach;
  const fallback = m.lineups[side].coach;
  const name = c?.name ?? fallback?.name;
  if (!name) return <div className="rounded-lg bg-terrace/50 p-2.5 font-ui text-xs text-mute">Coach unknown</div>;
  const t = tenure(c?.appointed);
  const r = c?.record;
  return (
    <button onClick={onOpen} disabled={!c} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-terrace/60 p-2 text-left ring-1 ring-transparent transition-colors hover:ring-rule disabled:cursor-default">
      <Photo src={c?.photo ?? fallback?.photo} name={name} className="size-11" ring="var(--team)" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-ui text-[15px] font-bold">{name}</div>
        <div className="truncate font-ui text-xs text-mute">
          {[c?.nationality ?? fallback?.country, (c?.age ?? fallback?.age) ? `${c?.age ?? fallback?.age}` : undefined].filter(Boolean).join(", ")}
          {t && <> · <span {...tip("tenure")}>since {t.since}</span></>}
        </div>
        {r && (
          <div className="mt-0.5 flex items-center gap-1.5 font-ui text-xs tnum text-chalk/85">
            <span className="text-win">{r.w}W</span>
            <span className="text-draw">{r.d}D</span>
            <span className="text-loss">{r.l}L</span>
            {r.ppg != null && (
              <span className="text-mute" {...tip("ppg")}>
                · {r.ppg.toFixed(2)} ppg
              </span>
            )}
            {c?.formation && <span className="ml-auto rounded bg-night/60 px-1 text-[11px] text-chalk/80" {...tip("formation")}>{c.formation}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function LoadCard({ team }: { team?: TeamDetail }) {
  if (!team) return <div className="h-[60px] animate-pulse rounded-lg bg-terrace/40" />;
  const { last, next, daysRest, daysToNext, last30 } = team.load;
  const tired = daysRest != null && daysRest < 4;
  return (
    <div className="min-w-0 rounded-lg bg-terrace/60 p-2 font-ui text-xs leading-snug" {...tip("load", `${last30} matches in the last 30 days.`)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-mute">Rest</span>
        <span className={`font-semibold tnum ${tired ? "text-yellow" : "text-chalk"}`}>{daysRest != null ? relDays(daysRest) : "–"}</span>
      </div>
      {last && (
        <div className="truncate text-chalk/75">
          {last.result && <span className="font-semibold" style={{ color: last.result === "W" ? "var(--color-win)" : last.result === "L" ? "var(--color-loss)" : "var(--color-draw)" }}>{last.result} {last.score}</span>} {last.home ? "vs" : "at"} {last.opponent.name}
          <span className="text-mute"> · {last.comp}</span>
        </div>
      )}
      {next && (
        <div className="mt-0.5 truncate text-chalk/75">
          <span className="text-mute">Next</span> {next.home ? "vs" : "at"} {next.opponent.name}
          <span className="text-mute"> · {next.comp} in {relDays(daysToNext)}</span>
        </div>
      )}
    </div>
  );
}

const SHORT: Record<string, string> = { xg: "xG for", xga: "xG against", gpm: "Scored / game", gcpm: "Conceded / game", poss: "Possession", cs: "Clean sheets", bc: "Big chances", sotpm: "On target / game" };

function Profile({ team }: { team: TeamDetail }) {
  const order = ["xg", "xga", "gpm", "gcpm", "poss", "cs", "bc", "sotpm"];
  const items = order.map((k) => team.profile.find((p) => p.key === k)).filter((p): p is NonNullable<typeof p> => !!p);
  const tipKey: Record<string, string> = { xg: "xg", xga: "xga", poss: "possession", cs: "cleanSheets", bc: "bigChances" };
  return (
    <div className="grid shrink-0 grid-cols-4 gap-x-2 gap-y-1.5 @lg:grid-cols-8">
      {items.map((p) => (
        <div key={p.key} className="min-w-0 rounded-md bg-night/40 px-1.5 py-1" {...(tipKey[p.key] ? tip(tipKey[p.key], `League season so far. Rank ${p.rank ?? "–"} of ${team.leagueSize ?? 20}.`) : { "data-tip": `${p.label}, league season so far. Rank ${p.rank ?? "–"} of ${team.leagueSize ?? 20}.` })}>
          <div className="truncate font-ui text-[10.5px] text-mute">{SHORT[p.key] ?? p.label}</div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="font-display text-lg font-bold leading-none tnum">{p.display}</span>
            <RankNote rank={p.rank} of={team.leagueSize ?? 20} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- squad list ----------

type Row =
  | { kind: "head"; label: string; aside?: string }
  | { kind: "player"; lp?: LineupPlayer; sp?: SquadPlayer; out?: Absentee; group: "xi" | "bench" | "out" | "squad" }
  | { kind: "more"; count: number; label: string };

const ROW = 30;
const HEAD = 22;

function Squad({ m, side, team, mode }: { m: MatchDetail; side: Side; team?: TeamDetail; mode: NumbersMode }) {
  const [ref, { h }] = useSize<HTMLDivElement>();
  const [all, setAll] = useState(false);
  const lineup = m.lineups[side];
  const kit = kitOf(m, side);
  const byId = useMemo(() => new Map(team?.squad.map((p) => [p.id, p]) ?? []), [team]);

  const groups = useMemo(() => {
    const xi = lineup.starters.map((lp) => ({ lp, sp: byId.get(lp.id) }));
    // Subs who came on go first on the bench.
    const bench = [...lineup.bench].sort((a, b) => Number(!!b.marks.subIn) - Number(!!a.marks.subIn)).map((lp) => ({ lp, sp: byId.get(lp.id) }));
    const out = lineup.unavailable.map((u) => ({ out: u, sp: team?.squad.find((s) => s.name === u.name) }));
    const used = new Set([...lineup.starters, ...lineup.bench].map((p) => p.id));
    const rest = (team?.squad ?? []).filter((p) => !used.has(p.id) && !lineup.unavailable.some((u) => u.name === p.name)).map((sp) => ({ sp }));
    return { xi, bench, out, rest };
  }, [lineup, team, byId]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const hasXI = groups.xi.length >= 11;
    const xiLabel = lineup.status === "official" ? "Starting XI" : lineup.status === "probable" ? "Probable XI" : "Squad";
    if (hasXI) {
      out.push({ kind: "head", label: xiLabel, aside: lineup.formation });
      for (const r of groups.xi) out.push({ kind: "player", ...r, group: "xi" });
    }
    const outRows: Row[] = groups.out.length ? [{ kind: "head", label: "Unavailable", aside: `${groups.out.length}` }, ...groups.out.map((r) => ({ kind: "player" as const, ...r, group: "out" as const }))] : [];
    const benchRows: Row[] = hasXI && groups.bench.length ? [{ kind: "head", label: lineup.status === "official" ? "Bench" : "Next in line" }, ...groups.bench.map((r) => ({ kind: "player" as const, ...r, group: "bench" as const }))] : [];
    const squadRows: Row[] = !hasXI ? [{ kind: "head", label: "Squad by importance" }, ...groups.rest.map((r) => ({ kind: "player" as const, ...r, group: "squad" as const }))] : groups.rest.length && lineup.status === "official" ? [{ kind: "head", label: "Not in the squad" }, ...groups.rest.map((r) => ({ kind: "player" as const, ...r, group: "squad" as const }))] : [];
    return { fixed: out, outRows, benchRows, squadRows };
  }, [groups, lineup]);

  // Fit: XI always, then absences, bench, rest of squad; whatever doesn't fit goes behind a "+N" row.
  const visible = useMemo(() => {
    const heightOf = (r: Row) => (r.kind === "head" ? HEAD : ROW);
    let budget = h;
    const take: Row[] = [];
    const push = (list: Row[]) => {
      let i = 0;
      for (; i < list.length; i++) {
        const need = heightOf(list[i]) + (i < list.length - 1 ? 0 : 0);
        if (budget - need < (i < list.length - 1 ? ROW : 0)) break;
        budget -= need;
        take.push(list[i]);
      }
      const left = list.slice(i).filter((r) => r.kind === "player").length;
      if (left) {
        take.push({ kind: "more", count: left, label: "more" });
        budget -= ROW;
        return false;
      }
      return true;
    };
    if (!h) return [] as Row[];
    push(rows.fixed) && push(rows.outRows) && push(rows.benchRows) && push(rows.squadRows);
    return take;
  }, [rows, h]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SquadHeader mode={mode} m={m} />
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {visible.map((r, i) =>
          r.kind === "head" ? (
            <div key={i} className="flex items-end justify-between border-b border-rule/60 pb-0.5 font-ui text-[11.5px] font-semibold text-mute" style={{ height: HEAD }}>
              <span {...(r.label.startsWith("Probable") ? tip("probable", lineup.basis) : {})} className={r.label.startsWith("Probable") ? "explain" : ""}>{r.label}</span>
              {r.aside && <span className="font-normal tnum">{r.aside}</span>}
            </div>
          ) : r.kind === "more" ? (
            <button key={i} onClick={() => setAll(true)} className="w-full text-left font-ui text-xs font-semibold text-mute hover:text-chalk" style={{ height: ROW }}>
              +{r.count} more · see full squad
            </button>
          ) : (
            <PlayerRow key={i} r={r} m={m} side={side} kit={kit} mode={mode} />
          ),
        )}
      </div>
      {all && (
        <Modal label="Full squad" onClose={() => setAll(false)} className="sm:w-[min(760px,96vw)]">
          <div className="scroll-thin min-h-0 overflow-auto p-4 pt-12 @container">
            <h3 className="mb-2 font-display text-2xl font-extrabold">{m[side].name} squad</h3>
            <SquadHeader mode={mode} m={m} />
            {[...rows.fixed, ...rows.outRows, ...rows.benchRows, ...rows.squadRows].map((r, i) =>
              r.kind === "head" ? (
                <div key={i} className="mt-2 border-b border-rule/60 pb-0.5 font-ui text-xs font-semibold text-mute">{r.label}</div>
              ) : r.kind === "player" ? (
                <PlayerRow key={i} r={r} m={m} side={side} kit={kit} mode={mode} />
              ) : null,
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Columns appear as the panel widens (container queries), like a broadcast graphic that grows.
const COLS = "grid grid-cols-[22px_24px_minmax(0,1fr)_34px_30px_30px] @sm:grid-cols-[22px_24px_minmax(0,1fr)_34px_30px_30px_38px] @md:grid-cols-[22px_24px_minmax(0,1fr)_34px_30px_30px_38px_52px] @lg:grid-cols-[22px_24px_minmax(0,1fr)_34px_30px_30px_38px_52px_44px] items-center gap-x-2";

function SquadHeader({ mode, m }: { mode: NumbersMode; m: MatchDetail }) {
  const live = mode === "match" && m.state !== "pre";
  return (
    <div className={`${COLS} shrink-0 pb-0.5 font-ui text-[10.5px] text-faint`}>
      <span />
      <span />
      <span />
      <span className="text-center" {...tip(live ? "rating" : "seasonRating")}>{live ? "Rtg" : "Avg"}</span>
      <span className="text-right" data-tip={live ? "Goals in this match" : "League goals this season"}>G</span>
      <span className="text-right" data-tip={live ? "Assists in this match" : "League assists this season"}>A</span>
      <span className="hidden text-right @sm:block" data-tip={live ? "Minutes played" : "League starts (and sub appearances) this season"}>{live ? "Min" : "Apps"}</span>
      <span className="hidden text-right @md:block" {...(live ? tip("xg") : tip("marketValue"))}>{live ? "xG" : "Value"}</span>
      <span className="hidden text-right @lg:block" {...(live ? { "data-tip": "Chances created" } : tip("contract"))}>{live ? "KP" : "Until"}</span>
    </div>
  );
}

function PlayerRow({ r, m, side, kit, mode }: { r: Extract<Row, { kind: "player" }>; m: MatchDetail; side: Side; kit: { color: string; alt?: string }; mode: NumbersMode }) {
  const { lp, sp, out } = r;
  const name = lp?.name ?? sp?.name ?? out?.name ?? "";
  const jersey = lp?.jersey ?? sp?.jersey;
  const photo = lp?.photo ?? sp?.photo ?? out?.photo;
  const id = lp?.id ?? sp?.id;
  const fm = lp?.fmId ?? out?.fmId;
  const live = mode === "match" && m.state !== "pre";
  const injury = out ?? (sp?.injury && r.group !== "xi" ? { status: sp.injury.status, reason: sp.injury.reason, returns: sp.injury.returns } : undefined);
  const marks = lp?.marks;
  const didNotPlay = live && r.group === "bench" && !marks?.subIn;
  const role = lp?.role ?? sp?.role ?? out?.role;
  const posLabel = sp?.position ?? lp?.pos ?? role;
  const rating = live ? lp?.rating : lp?.seasonRating ?? sp?.rating ?? out?.seasonRating;
  const cells = live
    ? [marks ? marks.goals.length || "" : "", marks ? marks.assists.length || "" : "", lp?.fm?.min ?? (marks?.subIn ? "" : ""), lp?.fm?.xg != null ? lp.fm.xg.toFixed(2) : "", lp?.fm?.chances ?? ""]
    : [sp?.goals || (sp ? "" : ""), sp?.assists || "", sp ? `${sp.starts}${sp.apps > sp.starts ? `(${sp.apps - sp.starts})` : ""}` : "", euros(sp?.marketValue ?? lp?.marketValue ?? out?.marketValue) ?? "", yearsUntil(sp?.contractUntil) ?? ""];
  const open = () => id && go(playerHash(m.league, m.id, id, fm));
  return (
    <button
      onClick={open}
      disabled={!id && !fm}
      className={`${COLS} w-full rounded text-left hover:bg-terrace/70 ${didNotPlay || r.group === "out" ? "opacity-60" : ""}`}
      style={{ height: ROW }}
      data-tip={[
        posLabel,
        sp?.age ? `${sp.age} yrs${sp.nationality ? `, ${sp.nationality}` : ""}` : undefined,
        injury ? `${injury.reason ?? "Unavailable"}${injury.returns ? ` · back: ${injury.returns}` : ""}` : undefined,
        sp?.recentStarts != null ? `Started ${sp.recentStarts} of the last ${m.state === "pre" ? "few" : "recent"} matches` : undefined,
        lp?.confidence != null && r.group !== "out" ? `Recent starts share: ${Math.round(lp.confidence * 100)}%` : undefined,
      ].filter(Boolean).join("\n")}
      data-tip-title={name}
    >
      <Kit color={kit.color} alt={kit.alt} number={jersey} size={20} className="!text-[10px]" />
      <Photo src={photo} name={name} className="size-6" />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-ui text-[13px] font-semibold leading-none">{name}</span>
        {marks?.goals.map((g) => <span key={g} className="shrink-0 text-[10px]" data-tip={`Goal ${g}`}>⚽</span>)}
        {marks?.yellow && !marks.red && <CardIcon className="shrink-0" />}
        {marks?.red && <CardIcon red className="shrink-0" />}
        {marks?.subIn && <span className="shrink-0 font-ui text-[10.5px] text-win tnum">▲{marks.subIn}</span>}
        {marks?.subOut && <span className="shrink-0 font-ui text-[10.5px] text-red tnum">▼{marks.subOut}</span>}
        {lp?.potm && <span className="shrink-0 text-[11px] text-yellow" {...tip("potm")}>★</span>}
        {injury && (
          <span className={`shrink-0 rounded px-1 font-ui text-[10px] font-semibold leading-[14px] ${injury.status === "doubt" ? "bg-yellow/15 text-yellow" : "bg-red/15 text-red"}`}>
            {injury.status === "suspended" ? "Susp." : injury.status === "doubt" ? "Doubt" : "Out"}
          </span>
        )}
        <span className="hidden truncate font-ui text-[11px] text-faint @md:inline">{posLabel}</span>
      </span>
      <span className="text-center">{rating ? <Rating value={rating} /> : null}</span>
      {cells.map((c, i) => (
        <span key={i} className={`text-right font-ui text-[12.5px] tnum ${i >= 2 ? (i === 2 ? "hidden @sm:block" : i === 3 ? "hidden @md:block" : "hidden @lg:block") : ""} ${i < 2 && c ? "font-bold" : "text-chalk/75"}`}>
          {c}
        </span>
      ))}
    </button>
  );
}

