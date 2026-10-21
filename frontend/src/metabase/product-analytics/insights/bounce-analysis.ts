import { t } from "ttag";

import { bounceInsightPopulation } from "../sql/analyses/bounce-insights";
import { canShowBounces } from "../sql/analyses/path-steps";

import { getColumnAttributeRules } from "./candidates";
import { getBounceOutcome } from "./outcomes";
import type { InsightsAnalysis } from "./types";

/**
 * Insights into which visits bounce from the most common landing pages. Only
 * for paths from the start of a visit, like the bounce rate in the steps table.
 */
export const BOUNCE_INSIGHTS: InsightsAnalysis = {
  getOutcome: getBounceOutcome,
  appliesTo: (spec) =>
    spec.kind === "paths" &&
    spec.paths !== undefined &&
    canShowBounces(spec.paths),
  attributeKinds: ["column"],
  pairs: "search",
  getPopulation: (spec, attributes) => {
    const { ids, asOf } = getColumnAttributeRules(attributes);
    return bounceInsightPopulation(spec, ids, asOf);
  },
  getQuestions: (_spec, totals, labels) =>
    totals
      .flatMap(({ question, reached, converted }) => {
        const label = labels.get(question);
        return label !== undefined
          ? [
              {
                question,
                caption: t`Landing page`,
                labels: [label],
                reached,
                converted,
              },
            ]
          : [];
      })
      .sort((a, b) => a.question - b.question),
  // Each visit lands on one page, so the pages' visits add up.
  getCheckedCount: (questions) =>
    questions.reduce((total, { reached }) => total + reached, 0),
};
