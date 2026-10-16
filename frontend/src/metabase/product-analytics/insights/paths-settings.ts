import type { FunnelSettings } from "../analyses/types";

import type { Insight } from "./types";

/**
 * Settings that turn the insight's funnel into the paths between the two
 * steps of its transition, as a funnel of its own.
 */
export const getInsightPathsSettings = (
  insight: Pick<Insight, "transition">,
  steps: FunnelSettings["funnel.steps"],
): Pick<
  FunnelSettings,
  "funnel.steps" | "funnel.view" | "funnel.breakdown"
> => ({
  "funnel.steps": steps.slice(insight.transition - 1, insight.transition + 1),
  "funnel.view": "paths",
  "funnel.breakdown": [],
});
