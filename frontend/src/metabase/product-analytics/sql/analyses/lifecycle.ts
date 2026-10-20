import type { AnalysisSpec, LifecycleSpec } from "../../spec/types";
import { INTERVAL, dateTimeLit, lit } from "../compile/dialect";
import type { DrillPoint, QueryPlan } from "../compose";

import { pointString, scopedEvents, startOf } from "./base";
import { IN_RANGE_FLAG } from "./lookback";

/** The `events_base` column with when each actor was first seen, when the spec has one. */
export const FIRST_SEEN_EXTRA_COLUMN = "first_seen";

/** What lifecycle reads from `events_base` beyond each event's actor and time. */
export const lifecycleEventColumns = (
  lifecycle: LifecycleSpec,
): { as: string; sql: string }[] =>
  lifecycle.hasFirstSeen
    ? [{ as: FIRST_SEEN_EXTRA_COLUMN, sql: FIRST_SEEN_EXTRA_COLUMN }]
    : [];

/**
 * Aggregates over an actor's events in a period: whether any of them is in
 * the date range, and when the actor was first seen.
 */
export const lifecyclePeriodColumns = (lifecycle: LifecycleSpec): string[] => [
  `max(${IN_RANGE_FLAG}) AS in_range`,
  ...(lifecycle.hasFirstSeen
    ? [`min(${FIRST_SEEN_EXTRA_COLUMN}) AS first_seen_at`]
    : []),
];

/**
 * The window columns that place an actor's active period in the lifecycle,
 * over rows of `actor`, `period` and the `lifecyclePeriodColumns`, including
 * the periods read before the date range:
 *
 * - `previous`: the actor's active period before this one.
 * - `state`: new in the period they were first seen (without a first seen
 *   column, their first active period read), returning when they were active
 *   the period before, and resurrected otherwise. Like PostHog's, someone
 *   first seen before the range is resurrected in their first period in it.
 */
export const lifecycleStateColumns = (lifecycle: LifecycleSpec): string[] => {
  const firstPeriod = lifecycle.hasFirstSeen
    ? startOf(lifecycle.period, "first_seen_at")
    : "min(period) OVER (PARTITION BY actor)";
  return [
    "lagInFrame(period) OVER (PARTITION BY actor ORDER BY period) AS previous,",
    `${firstPeriod} AS first_period,`,
    "multiIf(",
    "  period = first_period, 'new',",
    `  previous = period - INTERVAL ${INTERVAL[lifecycle.period]}, 'returning',`,
    "  'resurrected'",
    ") AS state",
  ];
};

export const planLifecycle = (spec: AnalysisSpec): QueryPlan => {
  const lifecycle = spec.lifecycle;
  if (!lifecycle) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const base = scopedEvents(
    spec,
    lifecycle.active,
    lifecycleEventColumns(lifecycle),
  );
  const period = lifecycle.period;
  const step = INTERVAL[period];

  const periods = {
    name: "actor_periods",
    note: `one row per ${spec.grain} per ${period} they were active, including the ${period} before the range`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  ${startOf(period)} AS period,`,
      lifecyclePeriodColumns(lifecycle)
        .map((column) => `  ${column}`)
        .join(",\n"),
      "FROM scoped_events",
      "GROUP BY actor, period",
    ].join("\n"),
  };

  const rangePeriods = {
    name: "range_periods",
    note: `the ${period}s in the date range`,
    deps: ["actor_periods"],
    body: "SELECT DISTINCT period FROM actor_periods WHERE in_range = 1",
  };

  const classified = {
    name: "classified",
    note: "each active period in the range, compared against the actor's previous one",
    deps: ["actor_periods"],
    body: [
      "SELECT actor, period, state",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    period,",
      "    in_range,",
      lifecycleStateColumns(lifecycle)
        .map((column) => `    ${column}`)
        .join("\n"),
      "  FROM actor_periods",
      ")",
      "WHERE in_range = 1",
    ].join("\n"),
  };

  // An actor goes quiet in the period after each active period that the next
  // one doesn't follow straight on from. leadInFrame only sees the following
  // rows with an explicit frame, and gives the zero date, not NULL, after the
  // actor's last period.
  const wentQuiet = [
    "SELECT actor, period FROM (",
    "  SELECT",
    "    actor,",
    "    period,",
    "    leadInFrame(period) OVER (PARTITION BY actor ORDER BY period",
    "      ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next_period",
    "  FROM actor_periods",
    ")",
    `WHERE (next_period <= period OR next_period > period + INTERVAL ${step})`,
    `  AND period + INTERVAL ${step} IN (SELECT period FROM range_periods)`,
  ];

  const quiet = {
    name: "went_quiet",
    note: "the period in the range after each actor's last active one, where they did not return",
    deps: ["actor_periods", "range_periods"],
    body: [
      "SELECT",
      // Not aliased `period`: ClickHouse would read the alias in WHERE.
      `  period + INTERVAL ${step} AS quiet_period,`,
      "  count() AS actors",
      "FROM (",
      ...wentQuiet.map((line) => `  ${line}`),
      ")",
      "GROUP BY quiet_period",
    ].join("\n"),
  };

  const shown = spec.output.lifecycleShown ?? [
    "new",
    "returning",
    "resurrected",
    "dormant",
  ];
  const wanted = shown.filter((state) => state !== "dormant");

  const members = (point: DrillPoint): string | null => {
    const clickedPeriod = pointString(point.period);
    const state = pointString(point.state);
    if (clickedPeriod === null || state === null) {
      return null;
    }
    const at = dateTimeLit(clickedPeriod);
    if (state !== "dormant") {
      return `SELECT actor FROM classified\nWHERE period = ${at} AND state = ${lit(state)}`;
    }
    return [...wentQuiet, `  AND period + INTERVAL ${step} = ${at}`].join("\n");
  };

  return {
    ctes: [...base.ctes, periods, rangePeriods, classified, quiet],
    select: [
      "SELECT period, state, actors FROM (",
      "  SELECT period, state, count() AS actors",
      "  FROM classified",
      wanted.length
        ? `  WHERE state IN (${wanted.map((s) => `'${s}'`).join(", ")})`
        : "  WHERE 0",
      "  GROUP BY period, state",
      "  UNION ALL",
      "  SELECT quiet_period AS period, 'dormant' AS state, -actors AS actors",
      `  FROM went_quiet${shown.includes("dormant") ? "" : "\n  WHERE 0"}`,
      ")",
      "ORDER BY period, state",
    ].join("\n"),
    warnings: [
      ...base.warnings,
      ...(lifecycle.hasFirstSeen
        ? []
        : [
            "Without a column for when each person was first seen, people are new in their first active period read, which only reaches one period before the range.",
          ]),
    ],
    members,
  };
};
