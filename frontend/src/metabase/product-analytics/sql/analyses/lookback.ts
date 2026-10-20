import type { AnalysisSpec, Period } from "../../spec/types";

/** 1 on the events inside the date range, 0 on the history read before it. */
export const IN_RANGE_FLAG = "in_range";

/** How many periods DAU/MAU's (or WAU/MAU's) monthly window spans, the period itself included. */
export const MONTHLY_ACTIVE_PERIODS = { day: 30, week: 4 } as const;

/**
 * How far back the period before the range's first one can start. A range can
 * start partway through a period, so it's two periods' worth of days.
 */
const PREVIOUS_PERIOD_DAYS: Record<Period, number> = {
  day: 2,
  week: 14,
  month: 62,
};

/**
 * How many days of events before the date range an analysis reads, for
 * windows that reach back past its start. When it's more than 0, events_base
 * and scoped_events carry `IN_RANGE_FLAG`, and the planner keeps its output
 * inside the range.
 *
 * Lifecycle reads one period back, so people active then and in the range's
 * first period are returning, and those who stopped went quiet in it.
 */
export const getLookbackDays = (spec: AnalysisSpec): number => {
  if (spec.kind === "habit" && spec.habit?.measure === "ratio") {
    return 30;
  }
  if (spec.kind === "lifecycle" && spec.lifecycle !== undefined) {
    return PREVIOUS_PERIOD_DAYS[spec.lifecycle.period];
  }
  return 0;
};
