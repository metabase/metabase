import _ from "underscore";

import type { AnalysisSpec, Period } from "../../spec/types";
import { flagSql } from "../compile/flag";
import type { Cte } from "../compose";

import { scopedEvents, startOf } from "./base";
import { periodOf } from "./cohorts";
import type { EventCountAttribute } from "./event-activity";
import {
  type AttributeAsOfRules,
  type InsightPopulation,
  attributeAsOfSql,
  attributeSql,
} from "./insights";

/**
 * The periods since the start that insights ask about, by cohort period:
 * the usual retention checkpoints, like day 7 or week 4.
 */
const CHECKPOINTS: Record<Period, readonly number[]> = {
  day: [1, 7, 28],
  week: [1, 4, 13, 52],
  month: [1, 3, 6, 12],
};

/**
 * The checkpoints within the periods the cohorts are followed for. Question k
 * is the k-th of them.
 */
export const getCohortCheckpoints = (spec: AnalysisSpec): number[] => {
  const horizon = spec.cohorts?.horizon ?? 0;
  return CHECKPOINTS[periodOf(spec)].filter((offset) => offset < horizon);
};

/** What activity in the start period is counted in, to compare people as active. */
const ACTIVE_UNIT: Record<Period, string> = {
  day: "toStartOfHour(e.ts)",
  week: "toStartOfDay(e.ts)",
  month: "toStartOfDay(e.ts)",
};

const hitColumn = (flag: string) => `${flagSql(flag)}_hit`;

type CohortsInsightAttributes = {
  /** Column attributes, taken as of each actor's start. */
  columns: readonly string[];
  asOf: AttributeAsOfRules;
  /** Event attributes, counted in the start period from the start on. */
  events: readonly EventCountAttribute[];
};

/**
 * The cohorts' insight population, `cohort_returns`: one row per actor per
 * checkpoint they've reached by the end of the data. They convert when they
 * came back in that period, or in it or later, by the return rule.
 *
 * Column attributes are as of the actor's start. Event attributes count what
 * they did from their start to the end of its period, which ends before any
 * checkpoint, so they can't count the return itself.
 *
 * With `hasExpected`, each row's `expected` chance of coming back is the rate
 * of everyone at the checkpoint who was as active in their start period: on
 * as many days (hours, for a day) and with as many returning events, to a
 * power of 2. Without it, anything people do comes with being active, which
 * predicts coming back.
 */
export const cohortsInsightPopulation = (
  spec: AnalysisSpec,
  { columns, asOf, events }: CohortsInsightAttributes,
  { hasExpected }: { hasExpected: boolean },
): InsightPopulation | undefined => {
  const cohorts = spec.cohorts;
  const checkpoints = getCohortCheckpoints(spec);
  if (cohorts === undefined || checkpoints.length === 0) {
    return undefined;
  }
  const period = periodOf(spec);
  const ids = columns.map(attributeSql);
  const asOfSql = (id: string) => attributeAsOfSql(asOf, id);
  const flags = _.uniq(events.map(({ flag }) => flag));

  const base = scopedEvents(spec, undefined, [
    {
      as: "is_start",
      sql: cohorts.start !== undefined ? flagSql(cohorts.start.flag) : "1",
    },
    {
      as: "is_return",
      sql: cohorts.return !== undefined ? flagSql(cohorts.return.flag) : "1",
    },
    ...ids.map((id) => ({ as: `${id}_v`, sql: asOfSql(id).value })),
    ...flags.map((flag) => ({ as: hitColumn(flag), sql: flagSql(flag) })),
  ]);

  const starts: Cte = {
    name: "cohort_starts",
    note: "one row per actor who started: when, and the first value seen for each attribute",
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      "  minIf(ts, is_start) AS start_ts" + (ids.length > 0 ? "," : ""),
      ids
        .flatMap((id) => [
          `  argMinIf(${id}_v, ts, ${id}_v != '') AS ${id}_first`,
          `  minIf(ts, ${id}_v != '') AS ${id}_seen`,
        ])
        .join(",\n"),
      "FROM scoped_events",
      "GROUP BY actor",
      "HAVING countIf(is_start) > 0",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const isInStartPeriod = `e.ts >= s.start_ts AND ${startOf(period, "e.ts")} = ${startOf(period, "s.start_ts")}`;
  const offset = `dateDiff('${period}', ${startOf(period, "s.start_ts")}, ${startOf(period, "e.ts")})`;
  // An attribute only counts once it was seen by the actor's start, so a value
  // first recorded later, like a plan bought, can't predict coming back.
  const people: Cte = {
    name: "cohort_people",
    note: "one row per actor: each attribute as of their start, what they did in the start period, and when they came back",
    deps: ["cohort_starts", "scoped_events"],
    body: [
      "SELECT",
      "  s.actor AS actor,",
      ...ids.map(
        (id) =>
          `  if(any(s.${id}_first) != '' AND any(s.${id}_seen) <= any(s.start_ts), any(s.${id}_first), ${asOfSql(id).fallback}) AS ${id},`,
      ),
      ...flags.map(
        (flag) =>
          `  countIf(e.${hitColumn(flag)} = 1 AND ${isInStartPeriod}) AS ${flagSql(flag)}_count,`,
      ),
      `  uniqExactIf(${ACTIVE_UNIT[period]}, e.is_return = 1 AND ${isInStartPeriod}) AS active_units,`,
      `  countIf(e.is_return = 1 AND ${isInStartPeriod}) AS active_events,`,
      `  groupArrayIf(${offset}, e.is_return = 1) AS came_back,`,
      `  maxIf(${offset}, e.is_return = 1) AS furthest,`,
      `  dateDiff('${period}', ${startOf(period, "any(s.start_ts)")}, ${startOf(period, "(SELECT max(ts) FROM scoped_events)")}) AS reached`,
      "FROM cohort_starts AS s",
      "INNER JOIN scoped_events AS e ON e.actor = s.actor",
      "GROUP BY s.actor",
    ].join("\n"),
  };

  const converted =
    cohorts.returnRule === "exactly"
      ? "has(came_back, offset)"
      : "furthest >= offset";
  const rows: Cte = {
    name: hasExpected ? "cohort_checkpoints" : "cohort_returns",
    note: "one row per actor per checkpoint they've reached: whether they came back, and the attributes",
    deps: [people.name],
    body: [
      "SELECT",
      "  actor,",
      "  k,",
      `  ${converted} AS converted,`,
      "  active_units,",
      "  if(active_events > 0, floor(log2(active_events)), -1) AS active_events_scale" +
        (ids.length + events.length > 0 ? "," : ""),
      [
        ...ids,
        ...events.map(
          ({ id, flag, minCount }) =>
            `if(${flagSql(flag)}_count >= ${Math.max(1, Math.trunc(minCount))}, 'true', 'false') AS ${attributeSql(id)}`,
        ),
      ]
        .map((column) => `  ${column}`)
        .join(",\n"),
      `FROM ${people.name}`,
      `ARRAY JOIN [${checkpoints.join(", ")}] AS offset, arrayEnumerate([${checkpoints.join(", ")}]) AS k`,
      "WHERE reached >= offset",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const expected: Cte[] = hasExpected
    ? [
        {
          name: "cohort_returns",
          note: "each row's chance of coming back, at the rate of the people at its checkpoint who were as active in their start period",
          deps: [rows.name],
          body: [
            "SELECT",
            "  *,",
            "  avg(converted) OVER (PARTITION BY k, active_units, active_events_scale) AS expected",
            `FROM ${rows.name}`,
          ].join("\n"),
        },
      ]
    : [];

  return {
    ctes: [...base.ctes, starts, people, rows, ...expected],
    source: "cohort_returns",
    hasLabels: false,
    hasExpected,
    warnings: base.warnings,
  };
};
