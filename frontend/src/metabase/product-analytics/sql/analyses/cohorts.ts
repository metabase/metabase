import type { AnalysisSpec, Granularity, Period } from "../../spec/types";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents, startOf } from "./base";

/** The column the planner reads on `events_base` beyond the roles, when cohorts are by attribute. */
export const COHORT_ATTRIBUTE_COLUMN = "cohort_attribute";

const COHORT_PERIODS: Record<Granularity, Period> = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
};

/** The cohort period: the granularity, with hours rounded up to days. */
export const toCohortPeriod = (granularity: Granularity): Period =>
  COHORT_PERIODS[granularity];

export const periodOf = (spec: AnalysisSpec): Period =>
  toCohortPeriod(spec.bucket.granularity);

const ADD_PERIODS: Record<Period, string> = {
  day: "addDays",
  week: "addWeeks",
  month: "addMonths",
};

export const planCohorts = (spec: AnalysisSpec): QueryPlan => {
  const cohorts = spec.cohorts;
  if (!cohorts) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const period = periodOf(spec);
  const isByAttribute = cohorts.by === "attribute";
  const warnings: string[] = [];

  const base = scopedEvents(spec, undefined, [
    {
      as: "is_start",
      sql: cohorts.start !== undefined ? flagSql(cohorts.start.flag) : "1",
    },
    {
      as: "is_return",
      sql: cohorts.return !== undefined ? flagSql(cohorts.return.flag) : "1",
    },
    ...(isByAttribute
      ? [
          {
            as: "attribute_value",
            sql: `ifNull(toString(${COHORT_ATTRIBUTE_COLUMN}), '')`,
          },
        ]
      : []),
  ]);
  warnings.push(...base.warnings);

  const ctes: Cte[] = [...base.ctes];

  ctes.push({
    name: "first_starts",
    note: `when each ${spec.grain} first did the starting event in the date range`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      "  minIf(ts, is_start) AS start_ts",
      "FROM scoped_events",
      "GROUP BY actor",
      "HAVING countIf(is_start) > 0",
    ].join("\n"),
  });

  // An attribute that changes, like a plan, is read as of the start: its
  // latest value then would favor the people who stayed long enough to change it.
  ctes.push(
    isByAttribute
      ? {
          name: "starts",
          note: `each ${spec.grain} placed with their latest ${COHORT_ATTRIBUTE_COLUMN} as of their start`,
          deps: ["scoped_events", "first_starts"],
          body: [
            "SELECT",
            "  f.actor AS actor,",
            "  argMaxIf(e.attribute_value, e.ts, e.ts <= f.start_ts AND e.attribute_value != '') AS cohort,",
            `  ${startOf(period, "f.start_ts")} AS started`,
            "FROM first_starts AS f",
            "INNER JOIN scoped_events AS e ON e.actor = f.actor",
            "GROUP BY f.actor, f.start_ts",
          ].join("\n"),
        }
      : {
          name: "starts",
          note: `each ${spec.grain} placed in the ${period} they started in`,
          deps: ["first_starts"],
          body: [
            "SELECT",
            "  actor,",
            `  ${startOf(period, "start_ts")} AS cohort,`,
            "  cohort AS started",
            "FROM first_starts",
          ].join("\n"),
        },
  );

  // Returns only count inside the date range, so an actor's offsets stop at
  // the range's last period. Past it nothing is known, so those cells are
  // left out rather than shown as nobody coming back.
  const lastPeriod = `(SELECT max(${startOf(period, "ts")}) FROM scoped_events)`;
  ctes.push({
    name: "offsets",
    note: `how many ${period}s after their start each actor came back, and how many the date range can show`,
    deps: ["scoped_events", "starts"],
    body: [
      "SELECT",
      "  s.cohort AS cohort,",
      "  s.actor AS actor,",
      `  groupArray(dateDiff('${period}', s.started, ${startOf(period, "e.ts")})) AS came_back,`,
      `  max(dateDiff('${period}', s.started, ${startOf(period, "e.ts")})) AS furthest,`,
      `  dateDiff('${period}', s.started, ${lastPeriod}) AS observable`,
      "FROM starts AS s",
      "LEFT JOIN (SELECT actor, ts FROM scoped_events WHERE is_return) AS e",
      "  ON e.actor = s.actor",
      "GROUP BY cohort, actor, s.started",
    ].join("\n"),
  });

  const matched =
    cohorts.returnRule === "exactly"
      ? "has(came_back, offset)"
      : "furthest >= offset";

  const percent = spec.output.cohortsDisplay !== "counts";
  const isAverage = !isByAttribute && spec.output.cohortsLines === "average";
  const groupColumns = isAverage ? [] : ["cohort"];
  const dateColumn =
    !isByAttribute && !isAverage
      ? [`  ${ADD_PERIODS[period]}(cohort, offset) AS date,`]
      : [];

  return {
    ctes,
    select: [
      "SELECT",
      ...groupColumns.map((column) => `  ${column},`),
      "  offset,",
      ...dateColumn,
      // Each actor only in the offsets the range can show, so a late period's
      // rate isn't diluted by people who couldn't have returned yet, and the
      // size at offset 0, the first row, is the whole cohort.
      "  uniqExact(actor) AS cohort_size,",
      percent
        ? `  round(uniqExactIf(actor, ${matched}) / nullIf(uniqExact(actor), 0), 4) AS value`
        : `  uniqExactIf(actor, ${matched}) AS value`,
      "FROM offsets",
      "ARRAY JOIN range(toUInt32(greatest(observable + 1, 0))) AS offset",
      `GROUP BY ${[...groupColumns, "offset"].join(", ")}`,
      `ORDER BY ${[...groupColumns, "offset"].join(", ")}`,
    ].join("\n"),
    warnings: [
      ...warnings,
      isByAttribute || isAverage
        ? "Each person's clock starts at their first starting event in the date range. A period only counts the people who have reached it."
        : "Later cohorts have had less time to come back, so the far columns thin out — that is the triangle, not missing data.",
    ],
  };
};
