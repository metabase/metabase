import type { AnalysisSpec, Period } from "../../spec/types";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents, startOf } from "./base";

const periodOf = (spec: AnalysisSpec): Period =>
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
  const warnings: string[] = [];

  const base = scopedEvents(spec, undefined, [
    { as: "is_start", sql: flagSql(cohorts.start.flag) },
    { as: "is_return", sql: flagSql(cohorts.return.flag) },
  ]);
  warnings.push(...base.warnings);

  const ctes: Cte[] = [...base.ctes];

  ctes.push({
    name: "starts",
    note: `each ${spec.grain} placed in the ${period} their clock started`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  ${startOf(period, "minIf(ts, is_start)")} AS cohort`,
      "FROM scoped_events",
      "GROUP BY actor",
      "HAVING countIf(is_start) > 0",
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
      `  groupArray(dateDiff('${period}', s.cohort, ${startOf(period, "e.ts")})) AS came_back,`,
      `  max(dateDiff('${period}', s.cohort, ${startOf(period, "e.ts")})) AS furthest`,
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
      cohorts.rowMode === "started"
        ? `WHERE cohort IN (\n  SELECT DISTINCT cohort FROM starts ORDER BY cohort LIMIT ${cohorts.startPeriods}\n)`
        : "",
      "GROUP BY cohort, offset",
      "ORDER BY cohort, offset",
    ]
      .filter(Boolean)
      .join("\n"),
    warnings: [
      ...warnings,
      "Later cohorts have had less time to come back, so the far columns thin out — that is the triangle, not missing data.",
    ],
  };
};
