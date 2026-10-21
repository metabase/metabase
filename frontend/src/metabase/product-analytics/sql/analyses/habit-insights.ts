import type { AnalysisSpec, HabitSpec } from "../../spec/types";

import {
  type EventCountAttribute,
  eventActivityBase,
  eventActivityCte,
  eventActivityRowColumns,
  expectedOutcomeCte,
} from "./event-activity";
import type { InsightPopulation } from "./insights";
import {
  IN_RANGE_FLAG,
  MONTHLY_ACTIVE_PERIODS,
  getLookbackDays,
} from "./lookback";

/** The weeks after each active week the outcome counts activity in: the month of WAU/MAU. */
export const HABIT_WINDOW_WEEKS = MONTHLY_ACTIVE_PERIODS.week;

/** The most people the threshold makes regulars, as a share of rows, unless every row ties. */
const REGULAR_SHARE = 0.2;

const SUB_PERIODS_PER_WEEK: Record<HabitSpec["subPeriod"], number> = {
  day: 7,
  week: 1,
};

/** Habit asks one question, of everyone. */
export const HABIT_INSIGHT_QUESTION = 1;

/** The most sub-periods someone can be active in over the window. */
export const getHabitWindowSize = (habit: HabitSpec): number =>
  HABIT_WINDOW_WEEKS * SUB_PERIODS_PER_WEEK[habit.subPeriod];

/**
 * Habit's insight population, `habit_regulars`: one row per actor per week
 * they were active in, so the people who show up most count most, all at one
 * question. Attributes are whether they did each event at least so many times
 * that week.
 *
 * They convert, becoming regulars, when they're active in at least a
 * threshold of the sub-periods (days or weeks) of the next 4 weeks. Every row
 * gets a full 4 weeks ahead, inside the range and before its last week, which
 * may be cut short. The threshold is the smallest that makes at most 20% of
 * rows regulars, or the whole window when more than that are active in all of
 * it, and is the question's `label`.
 *
 * Each row's `expected` chance is the rate of everyone who was as active that
 * week, like lifecycle's.
 */
export const habitInsightPopulation = (
  spec: AnalysisSpec,
  attributes: readonly EventCountAttribute[],
): InsightPopulation | undefined => {
  const habit = spec.habit;
  if (habit === undefined) {
    return undefined;
  }
  const hasLookback = getLookbackDays(spec) > 0;
  const base = eventActivityBase(spec, habit.active, attributes);
  const activity = eventActivityCte(spec, "week", attributes, [
    `${hasLookback ? `max(${IN_RANGE_FLAG})` : "1"} AS in_range`,
  ]);
  // Active days are counted per week, so a week's days add up as its own.
  const subPeriods = habit.subPeriod === "day" ? "active_units" : "1";
  const ahead = {
    name: "habit_ahead",
    note: `how many ${habit.subPeriod}s each ${spec.grain} was active in over the ${HABIT_WINDOW_WEEKS} weeks after each active week`,
    deps: [activity.name],
    body: [
      "SELECT",
      "  *,",
      `  sum(${subPeriods}) OVER (PARTITION BY actor ORDER BY toRelativeWeekNum(period)`,
      `    RANGE BETWEEN 1 FOLLOWING AND ${HABIT_WINDOW_WEEKS} FOLLOWING) AS next_active`,
      `FROM ${activity.name}`,
    ].join("\n"),
  };
  const weeks = {
    name: "habit_weeks",
    note: `one row per active week in the range with ${HABIT_WINDOW_WEEKS} full weeks after it: the activity ahead and the attributes`,
    deps: [ahead.name, activity.name],
    body: [
      "SELECT",
      "  actor,",
      `  ${HABIT_INSIGHT_QUESTION} AS k,`,
      "  next_active,",
      eventActivityRowColumns(attributes)
        .map((column) => `  ${column}`)
        .join(",\n"),
      `FROM ${ahead.name}`,
      "WHERE in_range = 1",
      `  AND period + INTERVAL ${HABIT_WINDOW_WEEKS} WEEK < (SELECT max(period) FROM ${activity.name} WHERE in_range = 1)`,
    ].join("\n"),
  };
  // One past the most activity ahead that more than the share reach.
  const threshold = {
    name: "habit_threshold",
    note: `the least activity ahead that at most ${REGULAR_SHARE * 100}% of rows reach`,
    deps: [weeks.name],
    body: [
      `SELECT least(${getHabitWindowSize(habit)}, max(next_active) + 1) AS threshold`,
      "FROM (",
      "  SELECT",
      "    next_active,",
      "    sum(rows) OVER (ORDER BY next_active DESC) AS reaching,",
      "    sum(rows) OVER () AS total",
      "  FROM (",
      `    SELECT next_active, count() AS rows FROM ${weeks.name} GROUP BY next_active`,
      "  )",
      ")",
      `WHERE reaching > ${REGULAR_SHARE} * total`,
    ].join("\n"),
  };
  const outcomes = {
    name: "habit_outcomes",
    note: "whether each row's activity ahead reached the threshold",
    deps: [weeks.name, threshold.name],
    body: [
      "SELECT",
      "  *,",
      `  next_active >= (SELECT threshold FROM ${threshold.name}) AS converted,`,
      `  toString((SELECT threshold FROM ${threshold.name})) AS label`,
      `FROM ${weeks.name}`,
    ].join("\n"),
  };
  const expected = expectedOutcomeCte(
    "habit_regulars",
    outcomes.name,
    "each row's chance of becoming a regular, at the rate of the people who were as active",
  );

  return {
    ctes: [...base.ctes, activity, ahead, weeks, threshold, outcomes, expected],
    source: expected.name,
    hasLabels: true,
    hasExpected: true,
    warnings: base.warnings,
  };
};
