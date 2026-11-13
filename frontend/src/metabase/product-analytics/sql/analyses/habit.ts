import type { AnalysisSpec, HabitSpec } from "../../spec/types";
import { dateTimeLit, num } from "../compile/dialect";
import { grainLabel } from "../compile/grain";
import type { DrillPoint, QueryPlan } from "../compose";

import {
  AVG_EVENTS_COLUMN,
  AVG_SESSIONS_COLUMN,
  type BaseBlock,
  SESSION_EXTRA_COLUMN,
  pointString,
  scopedEvents,
  startOf,
} from "./base";
import {
  BREAKOUT_COLUMN,
  breakoutDeps,
  breakoutDrillCondition,
  breakoutGroupBy,
  breakoutOrderBy,
  breakoutSelect,
  withBreakout,
} from "./breakout";
import { IN_RANGE_FLAG, MONTHLY_ACTIVE_PERIODS } from "./lookback";

const ADD_PERIODS: Record<HabitSpec["subPeriod"], string> = {
  day: "toIntervalDay",
  week: "toIntervalWeek",
};

/** The column the active count is in: `dau` or `wau`. */
export const activeColumn = (subPeriod: HabitSpec["subPeriod"]): string =>
  subPeriod === "week" ? "wau" : "dau";

/**
 * Actives per sub-period over actives in the trailing month: 30 days, or 4
 * weeks. The month reaches back before the date range, through the lookback.
 */
const planRatio = (
  spec: AnalysisSpec,
  habit: HabitSpec,
  base: BaseBlock,
): QueryPlan => {
  const unit = habit.subPeriod;
  const windowPeriods = MONTHLY_ACTIVE_PERIODS[unit];
  const active = activeColumn(unit);

  const actorPeriods = {
    name: "actor_periods",
    note: `the ${unit}s each actor was active in, and whether each is in the date range`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      `  ${startOf(unit)} AS active_period,`,
      "  actor,",
      `  max(${IN_RANGE_FLAG}) AS in_range,`,
      "  count() AS events,",
      "  uniqExact(session) AS sessions",
      "FROM scoped_events",
      "GROUP BY active_period, actor",
    ].join("\n"),
  };
  // Each active period counts toward the month ending with it and the months
  // ending with the next few periods. Periods with nobody active in the range
  // drop out: those before it, and those past the data.
  const periodActives = {
    name: "period_actives",
    note: `actives per ${unit}, and over the ${windowPeriods} ${unit}s up to it`,
    deps: ["actor_periods", ...breakoutDeps(spec)],
    body: [
      "SELECT",
      ...breakoutSelect(spec),
      `  active_period + ${ADD_PERIODS[unit]}(periods_later) AS ${unit},`,
      `  uniqExactIf(actor, periods_later = 0 AND in_range = 1) AS ${active},`,
      "  uniqExact(actor) AS mau,",
      `  sumIf(events, periods_later = 0 AND in_range = 1) / nullIf(${active}, 0) AS ${AVG_EVENTS_COLUMN},`,
      `  sumIf(sessions, periods_later = 0 AND in_range = 1) / nullIf(${active}, 0) AS ${AVG_SESSIONS_COLUMN}`,
      `FROM ${withBreakout(spec, "actor_periods")}`,
      `ARRAY JOIN range(${windowPeriods}) AS periods_later`,
      `GROUP BY ${breakoutGroupBy(spec)}${unit}`,
      `HAVING ${active} > 0`,
    ].join("\n"),
  };

  const members = (point: DrillPoint): string | null => {
    const period = pointString(point[unit]);
    return period === null
      ? null
      : [
          "SELECT DISTINCT actor FROM scoped_events",
          `WHERE ${startOf(unit)} = ${dateTimeLit(period)}`,
          `  AND ${IN_RANGE_FLAG} = 1${breakoutDrillCondition(spec, point[BREAKOUT_COLUMN])}`,
        ].join("\n");
  };

  return {
    members,
    ctes: [...base.ctes, actorPeriods, periodActives],
    select: [
      "SELECT",
      ...breakoutSelect(spec),
      `  ${unit},`,
      `  ${active},`,
      "  mau,",
      `  round(${active} / mau, 4) AS ratio,`,
      `  ${AVG_EVENTS_COLUMN},`,
      `  ${AVG_SESSIONS_COLUMN}`,
      "FROM period_actives",
      `ORDER BY ${[...breakoutOrderBy(spec), unit].join(", ")}`,
    ].join("\n"),
    warnings: base.warnings,
  };
};

export const planHabit = (spec: AnalysisSpec): QueryPlan => {
  const habit = spec.habit;
  if (!habit) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const base = scopedEvents(spec, habit.active, [SESSION_EXTRA_COLUMN]);
  if (habit.measure === "ratio") {
    return planRatio(spec, habit, base);
  }

  const people = grainLabel(spec.grain);
  const counts = {
    name: "active_periods",
    note: `how many distinct ${habit.subPeriod}s each ${spec.grain} was active in, and their events and sessions`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  uniqExact(${startOf(habit.subPeriod)}) AS periods,`,
      "  count() AS events,",
      "  uniqExact(session) AS sessions",
      "FROM scoped_events",
      "GROUP BY actor",
    ].join("\n"),
  };

  const histogramMembers = (point: DrillPoint): string | null => {
    const periods = pointString(point.periods);
    return periods === null
      ? null
      : `SELECT actor FROM active_periods\nWHERE periods = ${num(periods)}${breakoutDrillCondition(spec, point[BREAKOUT_COLUMN])}`;
  };

  // Shares are of each group's people, so groups of different sizes compare.
  const groupWindow =
    spec.breakout !== undefined ? `PARTITION BY ${BREAKOUT_COLUMN}` : "";

  return {
    members: histogramMembers,
    ctes: [...base.ctes, counts],
    select: [
      "SELECT",
      ...breakoutSelect(spec),
      "  periods,",
      habit.percent
        ? `  round(count() / sum(count()) OVER (${groupWindow}), 4) AS ${people},`
        : `  count() AS ${people},`,
      `  sum(events) / sum(periods) AS ${AVG_EVENTS_COLUMN},`,
      `  sum(sessions) / sum(periods) AS ${AVG_SESSIONS_COLUMN}`,
      `FROM ${withBreakout(spec, "active_periods")}`,
      `GROUP BY ${breakoutGroupBy(spec)}periods`,
      `ORDER BY ${[...breakoutOrderBy(spec), "periods"].join(", ")}`,
    ].join("\n"),
    warnings: base.warnings,
  };
};
