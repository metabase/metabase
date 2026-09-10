import { t } from "ttag";

import type {
  OverviewEntityType,
  OverviewJudgementAxis,
  OverviewJudgementVerdict,
} from "metabase/api";
import { DEFAULT_CARD_GENERATOR_ID } from "metabase/metric-cube-viewer/generators";
import type { VerdictOption } from "metabase/viz-ab/VerdictButtons";

export const ENTITY_TYPES = ["metric", "table", "transform"] as const;

export type Arm = "baseline" | "new";

export const GEN_SEARCH_PARAM = "gen";
export const VIZ_SEARCH_PARAM = "viz";

export function isEntityType(value: unknown): value is OverviewEntityType {
  return ENTITY_TYPES.some((type) => type === value);
}

export function getEntityTypeLabel(type: OverviewEntityType): string {
  switch (type) {
    case "metric":
      return t`Metric`;
    case "table":
      return t`Table`;
    case "transform":
      return t`Transform`;
  }
}

/**
 * The generator behind each entity's shipped overview. Only tables have
 * alternative generators today; the other ids just label the baseline arm in
 * stored judgements.
 */
export const BASELINE_GENERATOR_ID: Record<OverviewEntityType, string> = {
  table: DEFAULT_CARD_GENERATOR_ID,
  metric: "metric-dimension-grid",
  transform: "transform-overview",
};

export function getVerdictLabel(verdict: OverviewJudgementVerdict): string {
  switch (verdict) {
    case "old":
      return t`Old better`;
    case "new":
      return t`New better`;
    case "both-fine":
      return t`Both fine`;
    case "both-suck":
      return t`Both suck`;
  }
}

export const OVERVIEW_VERDICTS: readonly OverviewJudgementVerdict[] = [
  "old",
  "new",
  "both-fine",
  "both-suck",
];

const VERDICT_HOTKEYS: Record<OverviewJudgementAxis, readonly string[]> = {
  generation: ["1", "2", "3", "4"],
  visualization: ["q", "w", "e", "r"],
};

export function getVerdictOptions(
  axis: OverviewJudgementAxis,
): VerdictOption<OverviewJudgementVerdict>[] {
  return OVERVIEW_VERDICTS.map((verdict, index) => ({
    value: verdict,
    label: getVerdictLabel(verdict),
    hotkey: VERDICT_HOTKEYS[axis][index],
    variant: verdict === "old" || verdict === "new" ? "filled" : "outline",
  }));
}

export function parseEntityId(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return value != null && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}
