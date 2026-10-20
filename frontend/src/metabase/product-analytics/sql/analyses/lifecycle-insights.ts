import _ from "underscore";

import type {
  AnalysisSpec,
  LifecycleStateName,
  Period,
} from "../../spec/types";
import { INTERVAL, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";

import { scopedEvents, startOf } from "./base";
import { type InsightPopulation, attributeSql } from "./insights";
import {
  lifecycleEventColumns,
  lifecyclePeriodColumns,
  lifecycleStateColumns,
} from "./lifecycle";

/** An attribute that's whether an event happened at least `minCount` times in the period. */
export type EventCountAttribute = {
  id: string;
  /** The event's flag column on `events_base`. */
  flag: string;
  minCount: number;
};

export type LifecycleInsightState = Exclude<LifecycleStateName, "dormant">;

/** The states a period can start from, by question number from 1. */
export const LIFECYCLE_INSIGHT_STATES: readonly LifecycleInsightState[] = [
  "new",
  "returning",
  "resurrected",
];

/** What activity within a period is counted in, to compare people as active. */
const ACTIVE_UNIT: Record<Period, string> = {
  day: "toStartOfHour(ts)",
  week: "toStartOfDay(ts)",
  month: "toStartOfDay(ts)",
};

const hitColumn = (flag: string) => `${flagSql(flag)}_hit`;
const countColumn = (flag: string) => `${flagSql(flag)}_count`;

/**
 * Lifecycle's insight population, `lifecycle_returns`: one row per actor per
 * period they were active in. Question k is the state they were in that
 * period, new, returning or resurrected, and they convert when they're active
 * the next period too. Attributes are whether they did each event at least so
 * many times that period.
 *
 * People who are more active come back more, and do everything more, so each
 * row's `expected` chance of coming back is the rate of everyone in the same
 * state who was as active: active in as many days (hours, for a day) and with
 * as many events, to a power of 2. Without the second, an event that comes
 * with heavy use, like an error, would look like a reason to come back.
 *
 * States come from `lifecycleStateColumns`, so they match the lifecycle
 * chart. The last period is left out, since there's no next one to come back
 * in, and so is the one before it, since the last may be cut short.
 */
export const lifecycleInsightPopulation = (
  spec: AnalysisSpec,
  attributes: readonly EventCountAttribute[],
): InsightPopulation | undefined => {
  const lifecycle = spec.lifecycle;
  if (lifecycle === undefined) {
    return undefined;
  }
  const period = lifecycle.period;
  const step = `INTERVAL ${INTERVAL[period]}`;
  const flags = _.uniq(attributes.map(({ flag }) => flag));
  // Every event, so the attributes can count events that aren't activity.
  const base = scopedEvents(spec, undefined, [
    {
      as: "is_active",
      sql:
        lifecycle.active !== undefined ? flagSql(lifecycle.active.flag) : "1",
    },
    ...flags.map((flag) => ({ as: hitColumn(flag), sql: flagSql(flag) })),
    ...lifecycleEventColumns(lifecycle),
  ]);

  const activity = {
    name: "lifecycle_activity",
    note: `how active each ${spec.grain} was in each ${period}, and how many times they did each event`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  ${startOf(period)} AS period,`,
      `  uniqExactIf(${ACTIVE_UNIT[period]}, is_active = 1) AS active_units,`,
      "  countIf(is_active = 1) AS active_events,",
      [
        ...lifecyclePeriodColumns(lifecycle),
        ...flags.map(
          (flag) => `countIf(${hitColumn(flag)} = 1) AS ${countColumn(flag)}`,
        ),
      ]
        .map((column) => `  ${column}`)
        .join(",\n"),
      "FROM scoped_events",
      "GROUP BY actor, period",
      "HAVING active_units > 0",
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const states = {
    name: "lifecycle_states",
    note: "each active period's lifecycle state, and the actor's next active period",
    deps: [activity.name],
    body: [
      "SELECT",
      "  *,",
      "  leadInFrame(period) OVER (PARTITION BY actor ORDER BY period",
      "    ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next,",
      lifecycleStateColumns(lifecycle)
        .map((column) => `  ${column}`)
        .join("\n"),
      `FROM ${activity.name}`,
    ].join("\n"),
  };
  const ids = attributes.map(({ id }) => attributeSql(id));
  const periods = {
    name: "lifecycle_periods",
    note: "one row per active period in the range with a next one in it: its state, whether they came back, and the attributes",
    deps: [states.name, activity.name],
    body: [
      "SELECT",
      "  actor,",
      `  indexOf([${LIFECYCLE_INSIGHT_STATES.map(lit).join(", ")}], state) AS k,`,
      `  next = period + ${step} AS converted,`,
      "  active_units,",
      "  floor(log2(active_events)) AS active_events_scale" +
        (ids.length > 0 ? "," : ""),
      attributes
        .map(
          ({ id, flag, minCount }) =>
            `  if(${countColumn(flag)} >= ${Math.max(1, Math.trunc(minCount))}, 'true', 'false') AS ${attributeSql(id)}`,
        )
        .join(",\n"),
      `FROM ${states.name}`,
      "WHERE in_range = 1",
      `  AND period + ${step} < (SELECT max(period) FROM ${activity.name} WHERE in_range = 1)`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const returns = {
    name: "lifecycle_returns",
    note: "each row's chance of coming back, at the rate of the people in its state who were as active",
    deps: [periods.name],
    body: [
      "SELECT",
      "  *,",
      "  avg(converted) OVER (PARTITION BY k, active_units, active_events_scale) AS expected",
      `FROM ${periods.name}`,
    ].join("\n"),
  };

  return {
    ctes: [...base.ctes, activity, states, periods, returns],
    source: returns.name,
    hasLabels: false,
    hasExpected: true,
    warnings: base.warnings,
  };
};
