import type { AnalysisSpec } from "../../spec/types";

/** 1 on the events inside the date range, 0 on the history read before it. */
export const IN_RANGE_FLAG = "in_range";

/** How many periods DAU/MAU's (or WAU/MAU's) monthly window spans, the period itself included. */
export const MONTHLY_ACTIVE_PERIODS = { day: 30, week: 4 } as const;

/**
 * How many days of events before the date range an analysis reads, for
 * windows that reach back past its start. When it's more than 0, events_base
 * and scoped_events carry `IN_RANGE_FLAG`, and the planner keeps its output
 * inside the range.
 */
export const getLookbackDays = (spec: AnalysisSpec): number =>
  spec.kind === "habit" && spec.habit?.measure === "ratio" ? 30 : 0;
