export const STRING_OPERATORS = [
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

export const NUMBER_OPERATORS = [
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

export const BOOLEAN_OPERATORS = ["=", "is-empty", "not-empty"] as const;

export const TEMPORAL_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "quarter",
  "month",
  "year",
] as const;
