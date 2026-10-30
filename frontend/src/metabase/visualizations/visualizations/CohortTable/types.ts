export const COHORT_COLUMNS = [
  "cohort",
  "offset",
  "cohort_size",
  "value",
] as const;

export type CohortColumnName = (typeof COHORT_COLUMNS)[number];

export type CohortPeriod = "day" | "week" | "month";

export type CohortValueFormat = "percent" | "counts";

/** A result column a cell's tooltip shows, under `title`. */
export type CohortTooltipColumn = {
  name: string;
  title: string;
};

/** One line of a cell's tooltip. */
export type CohortCellDetail = {
  title: string;
  value: number;
};

export type CohortRow = {
  /** The cohort label as stored: an ISO date for date cohorts, else an attribute value. */
  key: string;
  size: number;
  /** Value by period offset. */
  values: Map<number, number>;
  /** Tooltip lines by period offset, from the tooltip columns. */
  details: Map<number, CohortCellDetail[]>;
};
