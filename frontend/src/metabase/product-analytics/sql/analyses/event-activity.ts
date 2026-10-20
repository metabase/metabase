import _ from "underscore";

import type { AnalysisSpec, FlagRef, Period } from "../../spec/types";
import { flagSql } from "../compile/flag";
import type { Cte } from "../compose";

import { type BaseBlock, scopedEvents, startOf } from "./base";
import { attributeSql } from "./insights";

/** An attribute that's whether an event happened at least `minCount` times in the period. */
export type EventCountAttribute = {
  id: string;
  /** The event's flag column on `events_base`. */
  flag: string;
  minCount: number;
};

/** What activity within a period is counted in, to compare people as active. */
const ACTIVE_UNIT: Record<Period, string> = {
  day: "toStartOfHour(ts)",
  week: "toStartOfDay(ts)",
  month: "toStartOfDay(ts)",
};

const hitColumn = (flag: string) => `${flagSql(flag)}_hit`;
const countColumn = (flag: string) => `${flagSql(flag)}_count`;

/**
 * Every event, not just activity, so the attributes can count events that
 * aren't activity. `is_active` marks activity, and each attribute's event has
 * a column.
 */
export const eventActivityBase = (
  spec: AnalysisSpec,
  active: FlagRef | undefined,
  attributes: readonly EventCountAttribute[],
  extraColumns: { as: string; sql: string }[] = [],
): BaseBlock =>
  scopedEvents(spec, undefined, [
    {
      as: "is_active",
      sql: active !== undefined ? flagSql(active.flag) : "1",
    },
    ..._.uniq(attributes.map(({ flag }) => flag)).map((flag) => ({
      as: hitColumn(flag),
      sql: flagSql(flag),
    })),
    ...extraColumns,
  ]);

/**
 * One row per actor per period they were active in, over
 * `eventActivityBase`: `active_units`, how many hours (for a day) or days
 * they were active in, `active_events`, and how many times they did each
 * attribute's event. `columns` are more aggregates over the period's events.
 */
export const eventActivityCte = (
  spec: AnalysisSpec,
  period: Period,
  attributes: readonly EventCountAttribute[],
  columns: readonly string[],
): Cte => ({
  name: "event_activity",
  note: `how active each ${spec.grain} was in each ${period}, and how many times they did each event`,
  deps: ["scoped_events"],
  body: [
    "SELECT",
    "  actor,",
    `  ${startOf(period)} AS period,`,
    `  uniqExactIf(${ACTIVE_UNIT[period]}, is_active = 1) AS active_units,`,
    "  countIf(is_active = 1) AS active_events,",
    [
      ...columns,
      ..._.uniq(attributes.map(({ flag }) => flag)).map(
        (flag) => `countIf(${hitColumn(flag)} = 1) AS ${countColumn(flag)}`,
      ),
    ]
      .map((column) => `  ${column}`)
      .join(",\n"),
    "FROM scoped_events",
    "GROUP BY actor, period",
    "HAVING active_units > 0",
  ].join("\n"),
});

/**
 * Columns over `eventActivityCte`'s rows: what people are compared as active
 * by, then each attribute, from its event's count in the period.
 */
export const eventActivityRowColumns = (
  attributes: readonly EventCountAttribute[],
): string[] => [
  "active_units",
  "floor(log2(active_events)) AS active_events_scale",
  ...attributes.map(
    ({ id, flag, minCount }) =>
      `if(${countColumn(flag)} >= ${Math.max(1, Math.trunc(minCount))}, 'true', 'false') AS ${attributeSql(id)}`,
  ),
];

/**
 * Each row's `expected` chance of the outcome: the rate of everyone at the
 * same question who was as active, in as many units and with as many events,
 * to a power of 2. Without the second, an event that comes with heavy use,
 * like an error, would look like a reason for the outcome.
 */
export const expectedOutcomeCte = (
  name: string,
  source: string,
  note: string,
): Cte => ({
  name,
  note,
  deps: [source],
  body: [
    "SELECT",
    "  *,",
    "  avg(converted) OVER (PARTITION BY k, active_units, active_events_scale) AS expected",
    `FROM ${source}`,
  ].join("\n"),
});
