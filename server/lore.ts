// Hand-written club history and coach styles (data/*.json), keyed by ESPN club name and FotMob coach name.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClubLore } from "../shared/types.ts";
import { norm } from "./fotmob.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");

function load(file: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  } catch {
    return {};
  }
}

const clubs = load("lore.json");
const coaches = load("coaches.json");
const byNorm = (table: Record<string, any>) => new Map(Object.entries(table).map(([k, v]) => [norm(k), v]));
const clubsN = byNorm(clubs);
const coachesN = byNorm(coaches);

export function lore(club: string): ClubLore | undefined {
  return clubs[club] ?? clubsN.get(norm(club));
}

export function coachLore(name: string): { style?: string; known_for?: string } | undefined {
  return coaches[name] ?? coachesN.get(norm(name));
}
