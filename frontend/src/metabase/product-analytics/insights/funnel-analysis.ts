import { c } from "ttag";

import { funnelInsightPopulation } from "../sql/analyses/funnel-insights";

import { getColumnAttributeRules } from "./candidates";
import { getConversionOutcome } from "./outcomes";
import type { InsightsAnalysis } from "./types";

const stepLabel = (step: number) =>
  c("{0} is a funnel step number").t`Step ${step}`;

const stepDetail = (step: number, label: string) =>
  c("{0} is a funnel step number, {1} is what the step counts")
    .t`Step ${step}: ${label}`;

/** Insights into who reaches each funnel step from the one before. */
export const FUNNEL_INSIGHTS: InsightsAnalysis = {
  getOutcome: getConversionOutcome,
  appliesTo: (spec) => spec.kind === "funnel",
  attributeKind: "column",
  searchesPairs: true,
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
                labels: [stepLabel(question), stepLabel(question + 1)],
                details: [
                  stepDetail(question, from.label),
                  stepDetail(question + 1, to.label),
                ],
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
