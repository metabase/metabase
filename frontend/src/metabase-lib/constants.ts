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

export const STRING_FILTER_OPERATORS_WITH_OPTIONS = [
  "contains",
  "does-not-contain",
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
  "is-null",
  "not-null",
] as const;

export const COORDINATE_FILTER_OPERATORS = [
  "=",
  "!=",
  "inside",
  ">",
  "<",
  "between",
  ">=",
  "<=",
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

export const TIME_FILTER_OPERATORS = [
  ">",
  "<",
  "between",
  "is-null",
  "not-null",
] as const;

export const RELATIVE_DATE_BUCKETS = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export const EXCLUDE_DATE_BUCKETS = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
] as const;
