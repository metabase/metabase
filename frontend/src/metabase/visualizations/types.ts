import type { Card } from "metabase-types/types/Card";

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;
