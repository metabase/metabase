import { c, t } from "ttag";

import { describeCondition, describeLift } from "../insights/describe";
import type { InsightsState } from "../insights/use-insights";
import type { AnalysisKind, AnalysisSpec } from "../spec/types";

type KindPrompts = {
  /** Shown when there's no insight to ask about. */
  fallback: () => string;
  static: () => string;
};

const KIND_PROMPTS: Record<AnalysisKind, KindPrompts> = {
  funnel: {
    fallback: () => t`Where do people drop off, and who?`,
    static: () => t`Are people converting in one visit?`,
  },
  paths: {
    fallback: () => t`Where do people go after landing?`,
    static: () => t`Tell me about bounce rate`,
  },
  habit: {
    fallback: () => t`How sticky is the product?`,
    static: () => t`What do regulars do differently?`,
  },
  lifecycle: {
    fallback: () => t`Why do people go quiet?`,
    static: () => t`What brings people back?`,
  },
  cohorts: {
    fallback: () => t`Which cohorts retain best?`,
    static: () => t`Is retention getting better?`,
  },
};

/** What an insight's group is more or less likely to do, like "reach Purchased". */
const describeOutcome = (spec: AnalysisSpec, question: number): string => {
  switch (spec.kind) {
    case "funnel": {
      const step = spec.funnel?.steps[question];
      return step !== undefined
        ? c("{0} is a funnel step").t`reach ${step.label}`
        : t`convert`;
    }
    case "paths":
      return t`bounce`;
    case "lifecycle":
      return t`come back`;
    case "habit":
      return t`become a regular`;
    case "cohorts":
      return t`come back`;
  }
};

/** A question about the insight that accounts for the most outcomes. */
const getInsightPrompt = (
  spec: AnalysisSpec,
  insights: InsightsState,
): string | undefined => {
  if (insights.status !== "done") {
    return undefined;
  }
  const top = [...insights.insights].sort(
    (a, b) => Math.abs(b.excess) - Math.abs(a.excess),
  )[0];
  if (top === undefined) {
    return undefined;
  }
  const condition = top.conditions
    .map(({ attributeId, value }) =>
      describeCondition(
        insights.attributes.find(({ id }) => id === attributeId),
        value,
      ),
    )
    .join(t` and `);
  return c(
    "{0} is a group like 'OS is iOS', {1} like '50% less likely', {2} like 'reach Purchased'",
  )
    .t`Why is “${condition}” ${describeLift(top)} to ${describeOutcome(spec, top.question)}?`;
};

/**
 * PROTOTYPE: three prompts for Metabot: one about the biggest insight (or a
 * fallback for the kind), one fixed for the kind, and one generic.
 */
export const getSuggestedPrompts = (
  spec: AnalysisSpec,
  insights: InsightsState,
): string[] => {
  const prompts = KIND_PROMPTS[spec.kind];
  return [
    getInsightPrompt(spec, insights) ?? prompts.fallback(),
    prompts.static(),
    t`What stands out here?`,
  ];
};
