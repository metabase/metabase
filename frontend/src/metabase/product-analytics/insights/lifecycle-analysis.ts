import { t } from "ttag";

import { getStateName } from "../analyses/lifecycle";
import type { Period } from "../spec/types";
import {
  LIFECYCLE_INSIGHT_STATES,
  lifecycleInsightPopulation,
} from "../sql/analyses/lifecycle-insights";

import { getReturnOutcome } from "./outcomes";
import type { EventInsightAttribute, InsightsAnalysis } from "./types";

/** Active the next period is what makes someone Returning in it. */
const getOutcomeLabel = (period: Period): string => {
  switch (period) {
    case "day":
      return t`Returning the following day`;
    case "week":
      return t`Returning the following week`;
    case "month":
      return t`Returning the following month`;
  }
};

/**
 * Insights into who comes back the next period, by what they did in the
 * period: one question for each state they were in, new, returning or
 * resurrected. People are compared with others as active as them.
 */
export const LIFECYCLE_INSIGHTS: InsightsAnalysis = {
  getOutcome: (spec) => getReturnOutcome(spec.lifecycle?.period ?? "week"),
  appliesTo: (spec) => spec.kind === "lifecycle",
  attributeKinds: ["event"],
  // A pair is better asked as a segment of its own, and with expected
  // outcomes, pairs are only counted to tell when one insight explains another.
  pairs: "overlaps",
  getPopulation: (spec, attributes) =>
    lifecycleInsightPopulation(
      spec,
      attributes.filter(
        (attribute): attribute is EventInsightAttribute =>
          attribute.kind === "event",
      ),
    ),
  getQuestions: (spec, totals) => {
    const outcome = getOutcomeLabel(spec.lifecycle?.period ?? "week");
    return totals
      .flatMap(({ question, reached, converted }) => {
        const state = LIFECYCLE_INSIGHT_STATES[question - 1];
        return state !== undefined
          ? [
              {
                question,
                labels: [getStateName(state), outcome],
                reached,
                converted,
              },
            ]
          : [];
      })
      .sort((a, b) => a.question - b.question);
  },
  // A person active in several periods counts once for each.
  getCheckedCount: (questions) =>
    questions.reduce((total, { reached }) => total + reached, 0),
};
