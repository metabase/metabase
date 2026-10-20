import { t } from "ttag";

import { getStateName } from "../analyses/lifecycle";
import type { Period } from "../spec/types";
import {
  LIFECYCLE_INSIGHT_STATES,
  type LifecycleInsightState,
  lifecycleInsightPopulation,
} from "../sql/analyses/lifecycle-insights";

import { getReturnOutcome } from "./outcomes";
import type { EventInsightAttribute, InsightsAnalysis } from "./types";

const getPeriodWords = (
  period: Period,
): { caption: string; outcome: string } => {
  switch (period) {
    case "day":
      return { caption: t`Day to day`, outcome: t`Back the next day` };
    case "week":
      return { caption: t`Week to week`, outcome: t`Back the next week` };
    case "month":
      return { caption: t`Month to month`, outcome: t`Back the next month` };
  }
};

/** Lifecycle calls resurrected people "Came back", which would read as the outcome here. */
const getStateLabel = (state: LifecycleInsightState): string =>
  state === "resurrected" ? t`Back after a break` : getStateName(state);

/**
 * Insights into who comes back the next period, by what they did in the
 * period: one question for each state they were in, new, returning or
 * resurrected. People are compared with others as active as them.
 */
export const LIFECYCLE_INSIGHTS: InsightsAnalysis = {
  getOutcome: (spec) => getReturnOutcome(spec.lifecycle?.period ?? "week"),
  appliesTo: (spec) => spec.kind === "lifecycle",
  attributeKind: "event",
  // A pair is better asked as a segment of its own.
  searchesPairs: false,
  getPopulation: (spec, attributes) =>
    lifecycleInsightPopulation(
      spec,
      attributes.filter(
        (attribute): attribute is EventInsightAttribute =>
          attribute.kind === "event",
      ),
    ),
  getQuestions: (spec, totals) => {
    const { caption, outcome } = getPeriodWords(
      spec.lifecycle?.period ?? "week",
    );
    return totals
      .flatMap(({ question, reached, converted }) => {
        const state = LIFECYCLE_INSIGHT_STATES[question - 1];
        return state !== undefined
          ? [
              {
                question,
                caption,
                labels: [getStateLabel(state), outcome],
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
