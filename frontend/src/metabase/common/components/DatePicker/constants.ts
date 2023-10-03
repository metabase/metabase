export const DATE_PICKER_OPERATORS = [
  "=",
  "!=",
  "<",
  ">",
  "between",
  "is-null",
  "not-null",
] as const;

export const DATE_PICKER_SHORTCUTS = [
  "today",
  "yesterday",
  "last-week",
  "last-7-days",
  "last-30-days",
  "last-month",
  "last-3-months",
  "last-12-months",
] as const;

export const DATE_PICKER_TRUNCATION_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "quarter",
  "month",
  "year",
] as const;

export const DATE_PICKER_EXTRACTION_UNITS = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
] as const;
