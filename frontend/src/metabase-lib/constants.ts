export const MATH_OPERATORS = ["+", "-", "*", "/"] as const;

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

export const TIME_OPERATORS = ["<", ">", "between"] as const;

export const INTERVAL_DATE_OPERATORS = [
  "interval",
  "relative-datetime",
] as const;

export const SPECIFIC_DATE_OPERATORS = ["=", "<", ">", "between"] as const;

export const RELATIVE_DATE_OPERATORS = ["time-interval", "between"] as const;

export const RELATIVE_DATE_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "quarter",
  "month",
  "year",
] as const;

export const EXCLUDE_DATE_OPERATORS = ["!=", "is-null", "not-null"] as const;

export const EXCLUDE_DATE_UNITS = [
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
  "hour-of-day",
] as const;

export const EXPRESSION_OPERATORS = [
  ...MATH_OPERATORS,
  ...STRING_OPERATORS,
  ...NUMBER_OPERATORS,
  ...BOOLEAN_OPERATORS,
  ...TIME_OPERATORS,
  ...INTERVAL_DATE_OPERATORS,
  ...SPECIFIC_DATE_OPERATORS,
  ...RELATIVE_DATE_OPERATORS,
  ...EXCLUDE_DATE_OPERATORS,
] as const;
