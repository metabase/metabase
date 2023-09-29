export const STRING_FILTER_OPERATORS = [
  "=",
  "!=",
  "contains",
  "does-not-contain",
  "is-null",
  "not-null",
  "is-empty",
  "not-empty",
  "starts-with",
  "ends-with",
] as const;

export const NUMBER_FILTER_OPERATORS = [
  "=",
  "!=",
  ">",
  "<",
  "between",
  ">=",
  "<=",
  "is-empty",
  "not-empty",
] as const;

export const BOOLEAN_FILTER_OPERATORS = ["=", "is-null", "not-null"] as const;

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

export const EXCLUDE_DATE_FILTER_BUCKETS = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
] as const;

export const TIME_FILTER_OPERATORS = [">", "<", "between"] as const;
