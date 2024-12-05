export const SPECIFIC_DATE_FILTER_OPERATORS = [
  "=",
  ">",
  "<",
  "between",
] as const;

export const EXCLUDE_DATE_FILTER_OPERATORS = [
  "!=",
  "is-null",
  "not-null",
] as const;

export const DEFAULT_FILTER_OPERATORS = ["is-null", "not-null"] as const;

export const EXCLUDE_DATE_BUCKETS = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
] as const;
