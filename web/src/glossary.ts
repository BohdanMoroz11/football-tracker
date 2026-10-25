// Short explainers for stats and terms, shown on hover. New stat or term = new entry here.

export const GLOSSARY: Record<string, { title: string; body: string }> = {
  xg: { title: "Expected goals (xG)", body: "How many goals the chances were worth, based on thousands of similar shots (distance, angle, body part, assist type). 1.0 xG ≈ one goal's worth of chances. Scoring well above xG usually means hot finishing that won't last." },
  xga: { title: "xG against", body: "Expected goals conceded: the quality of chances a team allows. Lower is better; it is the best single measure of how solid a defence really is." },
  xa: { title: "Expected assists (xA)", body: "The xG of shots a player set up with his pass. Credits chance creation even when the striker misses." },
  rating: { title: "Player rating", body: "FotMob's 0–10 match rating from dozens of on-ball events. 6.0–6.9 ordinary, 7.0–7.9 good, 8.0+ outstanding." },
  seasonRating: { title: "Season rating", body: "Average FotMob match rating this season. Around 7.0 is a solid regular; 7.5+ is among the league's best." },
  ppg: { title: "Points per game", body: "Average league points per match (3 for a win, 1 for a draw). 2.0+ is title form, 1.0 is relegation-battle form." },
  momentum: { title: "Momentum", body: "Who was on top, minute by minute: bars above the line are home pressure, below are away. Built from attacks, shots and dangerous possession." },
  momentumEstimate: { title: "Momentum (estimate)", body: "Our own pressure curve from the live commentary: shots, corners and goals push it toward the attacking team. FotMob's richer version replaces it when available." },
  probable: { title: "Probable lineup", body: "Not official yet. Built from the club's recent starting XIs, with injured and suspended players swapped for whoever has been starting in that role. The ring shows how often each player started lately." },
  official: { title: "Official lineup", body: "Confirmed team sheet, usually published about an hour before kickoff." },
  odds: { title: "Win chances", body: "Bookmaker odds converted to probabilities with the bookmaker's margin removed: home win, draw, away win." },
  overUnder: { title: "Goals line", body: "The bookmakers' goals line: they think the total is about as likely to go over as under it." },
  bigChances: { title: "Big chances", body: "Situations where a player should reasonably be expected to score, like one-on-ones or close-range shots." },
  boxTouches: { title: "Touches in their box", body: "Touches of the ball inside the opponent's penalty area: a good proxy for sustained attacking threat." },
  duels: { title: "Duels won", body: "One-against-one contests for the ball (tackles, dribbles, aerials) won." },
  possession: { title: "Possession", body: "Share of the ball. Says how a game was played more than who played better." },
  passPct: { title: "Pass accuracy", body: "Share of passes that reached a teammate. 85%+ is a patient possession side; under 75% is direct or under pressure." },
  cleanSheets: { title: "Clean sheets", body: "Matches without conceding." },
  form: { title: "Form", body: "Last five results in all competitions, oldest to newest. Hover a result for the score." },
  rest: { title: "Days of rest", body: "Days since the club's previous match in any competition. Under 4 days means tired legs and likely rotation." },
  load: { title: "Fixture load", body: "Matches in the last 30 days plus what's next. A Champions League trip in midweek often means rotation at the weekend." },
  squadValue: { title: "Squad value", body: "Transfermarkt's estimated market value of the whole squad, and its rank in the league. Compare it with the table to spot over- and underachievers." },
  marketValue: { title: "Market value", body: "Transfermarkt's estimate of what the player would cost on the transfer market today." },
  contract: { title: "Contract", body: "When the current contract runs out (Transfermarkt). Six months before expiry a player can agree a free move abroad." },
  confidence: { title: "Starts lately", body: "How often this player started in the club's recent matches, newest weighted most." },
  referee: { title: "Referee", body: "Season averages for this referee in this league: cards per game, red cards and penalties given." },
  recentStarts: { title: "Recent starts", body: "Starts in the club's last six matches in any competition: who the coach trusts right now." },
  importance: { title: "Importance", body: "Our estimate of how central a player is right now: starts, recent starts, output, rating and market value." },
  potm: { title: "Player of the match", body: "Highest-rated player in the match." },
  h2h: { title: "Head to head", body: "Recent meetings between these two clubs, in any competition." },
  stakes: { title: "What's at stake", body: "Where both clubs stand in the table and how far they are from what they're fighting for." },
  tenure: { title: "Tenure", body: "When the coach took charge, and the record since: matches, wins, draws, losses, points per game. All competitions." },
  formation: { title: "Formation", body: "Shape on paper, from defence to attack. Teams shift in and out of possession, so read it as the coach's base structure." },
  shotmap: { title: "Shot map", body: "Every shot, plotted where it was taken. Bigger dots were better chances (higher xG); filled dots are goals." },
};

export function tip(k: string, extra?: string) {
  const g = GLOSSARY[k];
  if (!g) return {};
  return { "data-tip": extra ? `${g.body}\n\n${extra}` : g.body, "data-tip-title": g.title };
}
