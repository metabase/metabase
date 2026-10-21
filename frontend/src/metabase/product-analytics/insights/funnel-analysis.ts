import { c } from "ttag";

import { funnelInsightPopulation } from "../sql/analyses/funnel-insights";

import { getColumnAttributeRules } from "./candidates";
import { getConversionOutcome } from "./outcomes";
import type { InsightsAnalysis } from "./types";

/** Insights into who reaches each funnel step from the one before. */
export const FUNNEL_INSIGHTS: InsightsAnalysis = {
  getOutcome: getConversionOutcome,
  appliesTo: (spec) => spec.kind === "funnel",
  attributeKinds: ["column"],
  pairs: "search",
  getPopulation: (spec, attributes) => {
    const { ids, asOf } = getColumnAttributeRules(attributes);
    return funnelInsightPopulation(spec, ids, asOf);
  },
  getQuestions: (spec, totals) => {
    const steps = spec.funnel?.steps ?? [];
    return totals
      .flatMap(({ question, reached, converted }) => {
        const from = steps[question - 1];
        const to = steps[question];
        return from !== undefined && to !== undefined
          ? [
              {
                question,
                caption: c("{0} and {1} are funnel step numbers")
                  .t`Step ${question} → ${question + 1}`,
                labels: [from.label, to.label],
                reached,
                converted,
              },
            ]
          : [];
      })
      .sort((a, b) => a.question - b.question);
  },
  // Everyone at the first step is everyone the funnel looked at.
  getCheckedCount: (questions) => questions[0]?.reached ?? 0,
};
