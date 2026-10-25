import type { Lineup, LineupPlayer, MatchDetail, Shot, Side } from "../../../shared/types";
import { accent, euros, go, minuteNum, playerHash, ratingColor, useSize } from "../lib";
import { Kit } from "./ui";

/** Kit colors for a side: the match uniform when ESPN has it, else the club colors. */
export function kitOf(m: MatchDetail, side: Side) {
  const k = m.lineups[side].kit;
  return { color: k?.color ?? m[side].color, alt: k?.alt ?? m[side].altColor };
}

/** Pitch markings in meters (105 x 68), drawn as chalk lines. */
function Markings({ vertical }: { vertical: boolean }) {
  const s = { stroke: "rgba(236,238,234,0.42)", strokeWidth: 0.32, fill: "none" } as const;
  const g = (
    <g {...s}>
      <rect x={0.5} y={0.5} width={104} height={67} />
      <line x1={52.5} y1={0.5} x2={52.5} y2={67.5} />
      <circle cx={52.5} cy={34} r={9.15} />
      <circle cx={52.5} cy={34} r={0.5} fill="rgba(236,238,234,0.5)" />
      {[0, 1].map((i) => {
        const x = i ? 104.5 : 0.5;
        const d = i ? -1 : 1;
        return (
          <g key={i}>
            <rect x={i ? x - 16.5 : x} y={13.84} width={16.5} height={40.32} />
            <rect x={i ? x - 5.5 : x} y={24.84} width={5.5} height={18.32} />
            <circle cx={x + d * 11} cy={34} r={0.45} fill="rgba(236,238,234,0.5)" />
            <path d={`M ${x + d * 16.5} ${34 - 7.3} A 9.15 9.15 0 0 ${i ? 0 : 1} ${x + d * 16.5} ${34 + 7.3}`} />
            <rect x={i ? x : x - 1.6} y={30.34} width={1.6} height={7.32} strokeWidth={0.25} />
          </g>
        );
      })}
    </g>
  );
  return (
    <svg viewBox={vertical ? "0 0 68 105" : "0 0 105 68"} className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
      {vertical ? <g transform="translate(68 0) rotate(90)">{g}</g> : g}
    </svg>
  );
}

type Spot = { left: number; top: number };

/** Map a player's team-relative spot (depth x, lateral y) to screen percentages. Home attacks right (or up). */
function spot(p: LineupPlayer, side: Side, vertical: boolean): Spot {
  const depth = (p.x ?? 0.5) * 0.5; // own half only
  const lat = p.y ?? 0.5;
  if (!vertical) return side === "home" ? { left: depth * 100, top: lat * 100 } : { left: (1 - depth) * 100, top: (1 - lat) * 100 };
  return side === "home" ? { left: lat * 100, top: (1 - depth) * 100 } : { left: (1 - lat) * 100, top: depth * 100 };
}

function Ball({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <circle cx="6" cy="6" r="5.4" fill="#fff" stroke="#111" strokeWidth="0.8" />
      <path d="M6 3.2 8.4 4.9 7.5 7.7H4.5L3.6 4.9Z" fill="#111" />
    </svg>
  );
}

export function CardIcon({ red, className = "" }: { red?: boolean; className?: string }) {
  return <span className={`inline-block h-[11px] w-[8px] rounded-[1.5px] ${red ? "bg-red" : "bg-yellow"} ${className}`} aria-label={red ? "Red card" : "Yellow card"} />;
}

function playerTip(p: LineupPlayer, lineup: Lineup, m: MatchDetail) {
  const lines = [
    [p.pos, p.age ? `${p.age} yrs` : undefined, p.nationality].filter(Boolean).join(" · "),
    p.seasonRating ? `Season rating ${p.seasonRating.toFixed(2)}` : undefined,
    p.marketValue ? `Value ${euros(p.marketValue)}` : undefined,
    p.confidence != null && lineup.status === "probable" ? `Started ${Math.round(p.confidence * 100)}% of recent matches (weighted)` : undefined,
    p.marks.goals.length ? `Goal${p.marks.goals.length > 1 ? "s" : ""} ${p.marks.goals.join(", ")}` : undefined,
    p.marks.assists.length ? `Assist${p.marks.assists.length > 1 ? "s" : ""} ${p.marks.assists.join(", ")}` : undefined,
    p.marks.subOut ? `Off ${p.marks.subOut}${p.replacedBy ? ` for ${[...lineup.bench].find((b) => b.id === p.replacedBy)?.name ?? ""}` : ""}` : undefined,
    p.fm?.xg != null ? `xG ${p.fm.xg.toFixed(2)}${p.fm.xa != null ? ` · xA ${p.fm.xa.toFixed(2)}` : ""}` : undefined,
    m.state !== "pre" && p.fm?.min ? `${p.fm.min} min played` : undefined,
    "Click for the full profile",
  ];
  return lines.filter(Boolean).join("\n");
}

function Counter({ p, side, m, vertical, size, showSeason }: { p: LineupPlayer; side: Side; m: MatchDetail; vertical: boolean; size: number; showSeason: boolean }) {
  const lineup = m.lineups[side];
  const kit = kitOf(m, side);
  const pos = spot(p, side, vertical);
  const sentOff = !!p.marks.red;
  const rating = showSeason ? p.seasonRating : p.rating;
  const probable = lineup.status === "probable";
  const label = p.short.replace(/^[A-ZÀ-Ý]\.\s*/, "");
  return (
    <button
      onClick={() => go(playerHash(m.league, m.id, p.id, p.fmId))}
      className={`group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:outline-none ${sentOff ? "opacity-50" : ""}`}
      style={{ left: `${pos.left}%`, top: `${pos.top}%`, width: size * 2.6 }}
      data-tip={playerTip(p, lineup, m)}
      data-tip-title={`${p.jersey ? `#${p.jersey} ` : ""}${p.name}`}
    >
      <span className="relative transition-transform group-hover:scale-110 group-focus-visible:scale-110">
        <Kit color={kit.color} alt={kit.alt} number={p.jersey} size={size} probable={probable} />
        {rating != null && (
          <span
            className="absolute -right-3 -top-1.5 rounded px-[3px] font-ui text-[10px] font-bold leading-[14px] text-[#0d1216] tnum shadow"
            style={{ background: ratingColor(rating), opacity: showSeason ? 0.85 : 1 }}
          >
            {rating.toFixed(1)}
          </span>
        )}
        {(p.marks.yellow || p.marks.red) && <CardIcon red={sentOff} className="absolute -left-1.5 -top-1 rotate-[-12deg] shadow" />}
        {p.marks.goals.length + p.marks.pens.length > 0 && (
          <span className="absolute -bottom-1 -left-2.5 flex">
            {p.marks.goals.map((g) => <Ball key={g} className="-mr-1 size-3 drop-shadow" />)}
          </span>
        )}
        {p.marks.ownGoals.length > 0 && <Ball className="absolute -bottom-1 -left-2.5 size-3 opacity-60 drop-shadow" />}
        {p.marks.assists.length > 0 && (
          <span className="absolute -bottom-1 -right-2.5 rounded-full bg-chalk px-1 font-ui text-[9px] font-bold leading-[12px] text-night">A{p.marks.assists.length > 1 ? p.marks.assists.length : ""}</span>
        )}
        {p.potm && <span className="absolute -right-3 top-2.5 text-[11px] text-yellow drop-shadow" aria-label="Player of the match">★</span>}
      </span>
      <span
        className="mt-1 max-w-full truncate rounded px-1 font-ui text-[11px] font-semibold leading-tight text-chalk [text-shadow:0_1px_2px_rgba(0,0,0,.9)] group-hover:bg-black/40"
      >
        {label}
      </span>
      {p.marks.subOut && (
        <span className="font-ui text-[10px] leading-tight text-red/90 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">▼ {p.marks.subOut}</span>
      )}
      {probable && p.confidence != null && (
        <span className="mt-0.5 h-[3px] w-6 overflow-hidden rounded-full bg-black/40">
          <span className="block h-full rounded-full bg-chalk/80" style={{ width: `${Math.round(p.confidence * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

function ShotDot({ s, m, vertical }: { s: Shot; m: MatchDetail; vertical: boolean }) {
  // Shots come normalised toward the opponent goal; home attacks right/up.
  const fx = s.x / 100;
  const fy = s.y / 100;
  const pos = !vertical
    ? s.side === "home" ? { left: fx * 100, top: fy * 100 } : { left: (1 - fx) * 100, top: (1 - fy) * 100 }
    : s.side === "home" ? { left: fy * 100, top: (1 - fx) * 100 } : { left: (1 - fy) * 100, top: fx * 100 };
  const color = accent(m[s.side].color, m[s.side].altColor);
  const d = 8 + Math.sqrt(s.xg ?? 0.06) * 26;
  const filled = s.outcome === "goal" || s.outcome === "on";
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        ...{ left: `${pos.left}%`, top: `${pos.top}%`, width: d, height: d },
        background: s.outcome === "goal" ? "#fff" : filled ? color : "transparent",
        border: `2px solid ${s.outcome === "goal" ? color : color}`,
        opacity: s.outcome === "blocked" ? 0.55 : 0.92,
        boxShadow: s.outcome === "goal" ? `0 0 0 3px ${color}55` : undefined,
      }}
      data-tip={`${s.minute} ${s.player ?? ""}\n${{ goal: "Goal", on: "On target (saved)", off: "Off target", blocked: "Blocked" }[s.outcome]}${s.xg != null ? ` · ${s.xg.toFixed(2)} xG` : ""}${s.text && s.text.length < 60 ? `\n${s.text}` : ""}`}
    />
  );
}

export type PitchMode = "lineups" | "shots";

export function Pitch({ m, mode, showSeason }: { m: MatchDetail; mode: PitchMode; showSeason: boolean }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  // Fit a 105x68 pitch into the box; go vertical when the box is tall (narrow windows).
  const vertical = w > 0 && w / Math.max(h, 1) < 1.05;
  const ratio = vertical ? 68 / 105 : 105 / 68;
  let pw = w;
  let ph = w / ratio;
  if (ph > h) {
    ph = h;
    pw = h * ratio;
  }
  const size = Math.round(Math.max(20, Math.min(36, (vertical ? pw : ph) / 13)));
  const hasXI = (s: Side) => m.lineups[s].starters.length >= 11 && m.lineups[s].starters.every((p) => p.x != null);

  return (
    <div ref={ref} className="relative grid h-full min-h-0 w-full place-items-center">
      {w > 0 && (
        <div className="turf relative overflow-hidden rounded-lg ring-1 ring-black/40" style={{ width: pw, height: ph, ["--stripe-dir" as string]: vertical ? "180deg" : "90deg" }}>
          <Markings vertical={vertical} />
          {mode === "lineups" &&
            (["home", "away"] as Side[]).map((s) =>
              hasXI(s) ? (
                m.lineups[s].starters.map((p) => <Counter key={`${s}${p.id}`} p={p} side={s} m={m} vertical={vertical} size={size} showSeason={showSeason} />)
              ) : (
                <NoLineup key={s} side={s} vertical={vertical} />
              ),
            )}
          {mode === "shots" && (
            <>
              {m.shots.map((s, i) => <ShotDot key={i} s={s} m={m} vertical={vertical} />)}
              {!m.shots.length && <div className="absolute inset-0 grid place-items-center font-ui text-sm text-chalk/70">No shots yet</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NoLineup({ side, vertical }: { side: Side; vertical: boolean }) {
  const pos = !vertical ? { left: side === "home" ? "25%" : "75%", top: "50%" } : { left: "50%", top: side === "home" ? "75%" : "25%" };
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/35 px-3 py-2 text-center font-ui text-xs text-chalk/80" style={pos}>
      Lineup not known yet
    </div>
  );
}

/** Pressure by minute as a mirrored bar strip, with goals marked. Home above the line, away below. */
export function Momentum({ m, height = 46 }: { m: MatchDetail; height?: number }) {
  const data = m.momentum;
  if (!data.length) return null;
  const maxMin = Math.max(90, data[data.length - 1].minute);
  const hc = accent(m.home.color, m.home.altColor);
  const ac = accent(m.away.color, m.away.altColor);
  const mid = height / 2;
  const goals = m.events.filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "own-goal");
  const reds = m.events.filter((e) => e.type === "red" || e.type === "second-yellow");
  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${maxMin} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Momentum">
        <line x1={0} x2={maxMin} y1={mid} y2={mid} stroke="rgba(236,238,234,.18)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <line x1={45} x2={45} y1={0} y2={height} stroke="rgba(236,238,234,.14)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        {data.map((d) => {
          const v = (d.value / 10) * (mid - 2);
          return <rect key={d.minute} x={d.minute + 0.12} width={0.76} y={v > 0 ? mid - v : mid} height={Math.abs(v)} fill={v > 0 ? hc : ac} opacity={0.85} />;
        })}
      </svg>
      {goals.map((g, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2"
          style={{ left: `${(minuteNum(g.minute) / maxMin) * 100}%`, top: g.side === "home" ? 0 : undefined, bottom: g.side === "away" ? 0 : undefined }}
          data-tip={`${g.minute} ${g.player ?? ""} (${g.score})`}
        >
          <Ball className="size-3 drop-shadow" />
        </span>
      ))}
      {reds.map((r, i) => (
        <span key={`r${i}`} className="absolute -translate-x-1/2" style={{ left: `${(minuteNum(r.minute) / maxMin) * 100}%`, top: r.side === "home" ? 2 : undefined, bottom: r.side === "away" ? 2 : undefined }} data-tip={`${r.minute} red card: ${r.player}`}>
          <CardIcon red />
        </span>
      ))}
    </div>
  );
}
