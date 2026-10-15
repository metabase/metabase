export const COHORT_COLUMNS = [
  "cohort",
  "offset",
  "cohort_size",
  "value",
] as const;

export type CohortColumnName = (typeof COHORT_COLUMNS)[number];

export type CohortPeriod = "day" | "week" | "month";

export type CohortValueFormat = "percent" | "counts";

export type CohortRow = {
  /** The cohort label as stored: an ISO date for date cohorts, else an attribute value. */
  key: string;
  size: number;
  /** Value by period offset. */
  values: Map<number, number>;
};
