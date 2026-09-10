// Option B: enumerate candidates, score, pick greedily.
import type { CardGenerator } from "../types";

import { getDefaultSettings } from "./default-settings";
import { generateCards } from "./generate-cards";

export const scoreAndPickGenerator: CardGenerator = {
  id: "score-and-pick",
  name: "Score and pick",
  description:
    "Scores every candidate card and picks greedily under a budget, with featured kinds, coverage and diversity rules.",
  getDefaultSettings,
  generateCards,
};
