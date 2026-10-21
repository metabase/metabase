import { c } from "ttag";

import * as Lib from "metabase-lib";

import type { AnalysisSpec } from "../spec/types";
import { COHORT_ATTRIBUTE_COLUMN, periodOf } from "../sql/analyses/cohorts";
import {
  cohortsInsightPopulation,
  getCohortCheckpoints,
} from "../sql/analyses/cohorts-insights";

import { getColumnAttributeRules } from "./candidates";
import { getComeBackOutcome } from "./outcomes";
import type { EventInsightAttribute, InsightsAnalysis } from "./types";

const getCheckpointLabel = (spec: AnalysisSpec, offset: number): string => {
  const unit = Lib.describeTemporalUnit(periodOf(spec)).toLowerCase();
  return spec.cohorts?.returnRule === "onOrAfter"
    ? c("{0} is a time unit such as week, {1} is how many of them")
        .t`Came back in ${unit} ${offset} or later`
    : c("{0} is a time unit such as week, {1} is how many of them")
        .t`Came back in ${unit} ${offset}`;
};

/**
 * Insights into who comes back at the usual retention checkpoints, like week
 * 1 and week 4, by their properties at their start and what they did in the
 * period they started. People are compared with others as active as them in
 * that period, so pairs are only counted to fold insights that explain each
 * other.
 */
export const COHORTS_INSIGHTS: InsightsAnalysis = {
  getOutcome: (spec) => getComeBackOutcome(periodOf(spec)),
  appliesTo: (spec) =>
    spec.kind === "cohorts" && getCohortCheckpoints(spec).length > 0,
  attributeKinds: ["column", "event"],
  pairs: "overlaps",
  getFocusColumn: (base) =>
    base.extraColumns.find(
      ({ as, from }) => as === COHORT_ATTRIBUTE_COLUMN && from === "events",
    )?.column,
  getPopulation: (spec, attributes) => {
    const { ids, asOf } = getColumnAttributeRules(attributes);
    return cohortsInsightPopulation(
      spec,
      {
        columns: ids,
        asOf,
        events: attributes.filter(
          (attribute): attribute is EventInsightAttribute =>
            attribute.kind === "event",
        ),
      },
      { hasExpected: true },
    );
  },
  getQuestions: (spec, totals) => {
    const checkpoints = getCohortCheckpoints(spec);
    return totals
      .flatMap(({ question, reached, converted }) => {
        const offset = checkpoints[question - 1];
        return offset !== undefined
          ? [
              {
                question,
                labels: [getCheckpointLabel(spec, offset)],
                reached,
                converted,
              },
            ]
          : [];
      })
      .sort((a, b) => a.question - b.question);
  },
  // Everyone who reached the first checkpoint, which is everyone who's had a
  // period to come back in.
  getCheckedCount: (questions) => questions[0]?.reached ?? 0,
};
