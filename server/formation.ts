// Places a starting XI on the pitch. ESPN gives each starter a formation slot ("formationPlace", Opta numbering)
// and a position code, but the codes are relative to the formation (in a 4-2-3-1 "LM"/"RM" are the two holding
// midfielders), so rows come from standard slot tables and the codes only decide left/right within a row.

/** Rows from back to front, slots listed from the team's right to its left (Opta convention: 2 = right back). */
const SLOTS: Record<string, number[][]> = {
  "4-4-2": [[2, 5, 6, 3], [7, 4, 8, 11], [10, 9]],
  "4-1-2-1-2": [[2, 5, 6, 3], [4], [7, 11], [8], [10, 9]],
  "4-3-3": [[2, 5, 6, 3], [7, 4, 8], [10, 9, 11]],
  "4-5-1": [[2, 5, 6, 3], [7, 4, 10, 8, 11], [9]],
  "4-1-4-1": [[2, 5, 6, 3], [4], [7, 8, 10, 11], [9]],
  "4-2-3-1": [[2, 5, 6, 3], [8, 4], [7, 10, 11], [9]],
  "4-4-1-1": [[2, 5, 6, 3], [7, 4, 8, 11], [10], [9]],
  "4-3-1-2": [[2, 5, 6, 3], [7, 4, 8], [10], [11, 9]],
  "4-2-2-2": [[2, 5, 6, 3], [8, 4], [7, 11], [10, 9]],
  "4-3-2-1": [[2, 5, 6, 3], [7, 4, 8], [10, 11], [9]],
  "3-4-2-1": [[6, 5, 4], [2, 7, 8, 3], [10, 11], [9]],
  "3-4-3": [[6, 5, 4], [2, 7, 8, 3], [10, 9, 11]],
  "3-5-2": [[6, 5, 4], [2, 7, 11, 8, 3], [10, 9]],
  "3-1-4-2": [[6, 5, 4], [11], [2, 7, 8, 3], [10, 9]],
  "3-4-1-2": [[6, 5, 4], [2, 7, 8, 3], [10], [11, 9]],
  "5-3-2": [[2, 6, 5, 4, 3], [7, 8, 11], [10, 9]],
  "5-4-1": [[2, 6, 5, 4, 3], [7, 8, 10, 11], [9]],
};

export type Placeable = { place?: number; pos?: string };

/** Lateral hint from a position code: 0 = team's left, 1 = team's right, 0.5 = central. */
function side(pos = ""): number | undefined {
  if (/-L$|^L/.test(pos)) return 0;
  if (/-R$|^R/.test(pos)) return 1;
  if (pos) return 0.5;
  return undefined;
}

// Generic depth when a formation has no table: 0 = own goal line, bigger = further forward.
const DEPTH: Record<string, number> = { G: 0, CD: 1, LB: 1.1, RB: 1.1, LWB: 1.6, RWB: 1.6, DM: 2, CM: 3, LM: 3.2, RM: 3.2, AM: 4, LW: 4.6, RW: 4.6, LF: 4.8, RF: 4.8, CF: 5, F: 5 };
const depthOf = (pos = "") => DEPTH[pos.replace(/-[LR]$/, "")] ?? 3;

/**
 * Returns each player's spot as { x: depth 0..1 from own goal, y: lateral 0 (team's left) .. 1 (right) },
 * in the input order. Works for any formation string; falls back to depth sorting when no slot table matches.
 */
export function place<T extends Placeable>(players: T[], formation?: string): (T & { x: number; y: number })[] {
  const gk = players.find((p) => p.place === 1 || p.pos === "G");
  const outfield = players.filter((p) => p !== gk);
  const counts = (formation ?? "").split("-").map(Number).filter((n) => n > 0);
  const valid = counts.reduce((a, b) => a + b, 0) === outfield.length;

  let rows: T[][];
  const table = formation ? SLOTS[formation] : undefined;
  const byPlace = new Map(outfield.map((p) => [p.place, p]));
  if (table && table.flat().every((s) => byPlace.has(s))) {
    rows = table.map((r) => r.map((s) => byPlace.get(s)!));
  } else {
    const sorted = [...outfield].sort((a, b) => depthOf(a.pos) - depthOf(b.pos) || (a.place ?? 0) - (b.place ?? 0));
    const sizes = valid ? counts : guessRows(sorted);
    rows = [];
    let i = 0;
    for (const n of sizes) rows.push(sorted.slice(i, (i += n)));
  }

  const spots = new Map<T, { x: number; y: number }>();
  if (gk) spots.set(gk, { x: 0.04, y: 0.5 });
  rows.forEach((row, ri) => {
    // Order within a row: the position code's side wins; slot tables list right-to-left, so keep that as a tiebreak.
    const ordered = row
      .map((p, i) => ({ p, s: side(p.pos) ?? 1 - i / Math.max(1, row.length - 1), i }))
      .sort((a, b) => a.s - b.s || b.i - a.i)
      .map((o) => o.p);
    const x = rows.length === 1 ? 0.5 : 0.2 + (ri / (rows.length - 1)) * 0.68;
    ordered.forEach((p, i) => {
      const y = ordered.length === 1 ? 0.5 : 0.1 + (i / (ordered.length - 1)) * 0.8;
      spots.set(p, { x, y: ordered.length === 2 ? 0.3 + i * 0.4 : y });
    });
  });
  return players.map((p) => ({ ...p, ...(spots.get(p) ?? { x: 0.5, y: 0.5 }) }));
}

function guessRows<T extends Placeable>(sorted: T[]): number[] {
  // Split into lines wherever depth jumps; good enough when ESPN sends no formation.
  const sizes: number[] = [];
  let prev = -1;
  for (const p of sorted) {
    const d = Math.floor(depthOf(p.pos));
    if (d !== prev) sizes.push(0);
    sizes[sizes.length - 1]++;
    prev = d;
  }
  return sizes;
}
