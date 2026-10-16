import type { FunnelSettings } from "../analyses/types";

import type { Insight, InsightAttribute } from "./types";

/**
 * Settings that turn the insight's funnel into a breakdown by the insight's
 * attributes, at the insight's transition.
 */
export const getInsightBreakdownSettings = (
  insight: Pick<Insight, "conditions" | "transition">,
  attributes: readonly InsightAttribute[],
): Pick<
  FunnelSettings,
  "funnel.view" | "funnel.breakdown" | "funnel.breakdown_step"
> => ({
  "funnel.view": "steps",
  "funnel.breakdown": insight.conditions.flatMap(({ attributeId }) => {
    const attribute = attributes.find(({ id }) => id === attributeId);
    return attribute !== undefined
      ? [{ column: attribute.column, from: attribute.from }]
      : [];
  }),
  "funnel.breakdown_step": insight.transition,
});
