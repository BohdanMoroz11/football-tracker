import type { League } from "../shared/types.ts";

// Competitions on the match list, in display order. Adding one = adding a line (same ESPN API for all).
export const LEAGUES: League[] = [
  { id: "esp.1", name: "LaLiga", short: "LaLiga", country: "Spain", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png" },
  { id: "eng.1", name: "Premier League", short: "EPL", country: "England", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png" },
  { id: "ger.1", name: "Bundesliga", short: "Bundesliga", country: "Germany", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png" },
  { id: "uefa.champions", name: "Champions League", short: "UCL", country: "Europe", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png" },
];

// Cups and other competitions clubs also play in: shown in fixture lists, opened when linked.
const EXTRA: Record<string, string> = {
  "esp.copa_del_rey": "Copa del Rey",
  "esp.super_cup": "Supercopa",
  "eng.fa": "FA Cup",
  "eng.league_cup": "League Cup",
  "ger.dfb_pokal": "DFB-Pokal",
  "uefa.europa": "Europa League",
  "uefa.europa.conf": "Conference League",
  "fifa.cwc": "Club World Cup",
  "ita.1": "Serie A",
  "fra.1": "Ligue 1",
  "ned.1": "Eredivisie",
  "por.1": "Liga Portugal",
  "bel.1": "Pro League",
  "tur.1": "Süper Lig",
  "sco.1": "Premiership",
  "aut.1": "Austrian Bundesliga",
  "sui.1": "Super League",
  "gre.1": "Super League Greece",
  "nor.1": "Eliteserien",
  "den.1": "Superliga",
  "cze.1": "Czech First League",
  "ukr.1": "Ukrainian Premier League",
  "aze.1": "Azerbaijan Premier League",
};

export const leagueById = (id: string): League =>
  LEAGUES.find((l) => l.id === id) ?? { id, name: EXTRA[id] ?? id, short: EXTRA[id] ?? id, country: "", logo: "" };

/** Map ESPN's competition display names ("2026-27 LALIGA", "UEFA Champions League") back to slugs. */
export function slugForCompetition(name = ""): string | undefined {
  const n = name.toLowerCase();
  if (n.includes("laliga") || n.includes("la liga")) return "esp.1";
  if (n.includes("premier league") && !n.includes("cup")) return "eng.1";
  if (n.includes("bundesliga") && !n.includes("2.")) return "ger.1";
  if (n.includes("champions league")) return "uefa.champions";
  if (n.includes("europa league")) return "uefa.europa";
  if (n.includes("conference league")) return "uefa.europa.conf";
  if (n.includes("copa del rey")) return "esp.copa_del_rey";
  if (n.includes("fa cup")) return "eng.fa";
  if (n.includes("dfb")) return "ger.dfb_pokal";
  if (n.includes("carabao") || n.includes("league cup")) return "eng.league_cup";
  return undefined;
}

/** Short competition label for fixture chips. */
export function compShort(name = ""): string {
  const slug = slugForCompetition(name);
  const known: Record<string, string> = {
    "esp.1": "LaLiga", "eng.1": "EPL", "ger.1": "BL", "uefa.champions": "UCL", "uefa.europa": "UEL",
    "uefa.europa.conf": "UECL", "esp.copa_del_rey": "Copa", "eng.fa": "FA Cup", "ger.dfb_pokal": "Pokal", "eng.league_cup": "EFL Cup",
  };
  return (slug && known[slug]) || name.replace(/^\d{4}(-\d{2})?\s*/, "");
}
