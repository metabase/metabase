import { t } from "ttag";

import type { VizJudgementVerdict } from "metabase/api";
import type { Card, DatasetData } from "metabase-types/api";

export type PanelKind = "saved" | "current" | "new";

export type PanelSeries = {
  card: Card;
  data: DatasetData;
};

export const VERDICTS: VizJudgementVerdict[] = [
  "saved",
  "current",
  "new",
  "tie",
  "skip",
];

export function getVerdictLabel(verdict: VizJudgementVerdict): string {
  switch (verdict) {
    case "saved":
      return t`Saved best`;
    case "current":
      return t`Current default best`;
    case "new":
      return t`New default best`;
    case "tie":
      return t`Tie`;
    case "skip":
      return t`Skip / broken`;
  }
}

export const VERDICT_KEYS: Record<string, VizJudgementVerdict> = {
  "1": "saved",
  "2": "current",
  "3": "new",
  "4": "tie",
  s: "skip",
};
