import type { AnalysisSpec, CohortsSpec, Period } from "../../spec/types";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents, startOf } from "./base";

/** The columns the planner reads on `events_base` beyond the roles. */
export const COHORT_COLUMN_NAMES: Record<CohortsSpec["by"], string> = {
  startDate: "cohort_start",
  attribute: "cohort_attribute",
};

/** The cohort period: the granularity, with hours rounded up to days. */
export const periodOf = (spec: AnalysisSpec): Period =>
  spec.bucket.granularity === "month"
    ? "month"
    : spec.bucket.granularity === "week"
      ? "week"
      : "day";

export const planCohorts = (spec: AnalysisSpec): QueryPlan => {
  const cohorts = spec.cohorts;
  if (!cohorts) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const period = periodOf(spec);
  const cohortColumn = COHORT_COLUMN_NAMES[cohorts.by];
  const warnings: string[] = [];

  const base = scopedEvents(spec, undefined, [
    {
      as: "is_return",
      sql: cohorts.return !== undefined ? flagSql(cohorts.return.flag) : "1",
    },
    { as: cohortColumn, sql: cohortColumn },
  ]);
  warnings.push(...base.warnings);

  const ctes: Cte[] = [...base.ctes];

  // Period 0 is the period of the actor's earliest start date, or of their
  // first event when cohorts are attribute values.
  const [cohort, started, note] =
    cohorts.by === "startDate"
      ? [
          startOf(period, `min(${cohortColumn})`),
          startOf(period, `min(${cohortColumn})`),
          `each ${spec.grain} placed in the ${period} their start date falls in`,
        ]
      : [
          `argMax(${cohortColumn}, ts)`,
          startOf(period, "min(ts)"),
          `each ${spec.grain} placed with their latest ${cohortColumn}, from the ${period} of their first event`,
        ];

  ctes.push({
    name: "starts",
    note,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  ${cohort} AS cohort,`,
      `  ${started} AS started`,
      "FROM scoped_events",
      "GROUP BY actor",
      "HAVING cohort IS NOT NULL",
    ].join("\n"),
  });

  ctes.push({
    name: "offsets",
    note: `how many ${period}s after their start each actor came back`,
    deps: ["scoped_events", "starts"],
    body: [
      "SELECT",
      "  s.cohort AS cohort,",
      "  s.actor AS actor,",
      `  groupArray(dateDiff('${period}', s.started, ${startOf(period, "e.ts")})) AS came_back,`,
      `  max(dateDiff('${period}', s.started, ${startOf(period, "e.ts")})) AS furthest`,
      "FROM starts AS s",
      "LEFT JOIN (SELECT actor, ts FROM scoped_events WHERE is_return) AS e",
      "  ON e.actor = s.actor",
      "GROUP BY cohort, actor",
    ].join("\n"),
  });

  const matched =
    cohorts.returnRule === "exactly"
      ? "has(came_back, offset)"
      : "furthest >= offset";

  const percent = spec.output.cohortsDisplay !== "counts";

  return {
    ctes,
    select: [
      "SELECT",
      "  cohort,",
      "  offset,",
      "  uniqExact(actor) AS cohort_size,",
      percent
        ? `  round(uniqExactIf(actor, ${matched}) / nullIf(uniqExact(actor), 0), 4) AS value`
        : `  uniqExactIf(actor, ${matched}) AS value`,
      "FROM offsets",
      `ARRAY JOIN range(${cohorts.horizon}) AS offset`,
      "GROUP BY cohort, offset",
      "ORDER BY cohort, offset",
    ].join("\n"),
    warnings: [
      ...warnings,
      cohorts.by === "startDate"
        ? "Later cohorts have had less time to come back, so the far columns thin out — that is the triangle, not missing data."
        : "Each person's clock starts at their first event in the date range.",
    ],
  };
};
