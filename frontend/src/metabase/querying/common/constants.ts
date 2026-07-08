export const SPECIFIC_DATE_PICKER_OPERATORS = [
  "=" as const,
  "<" as const,
  ">" as const,
  "between" as const,
];

export const EXCLUDE_DATE_PICKER_OPERATORS = [
  "!=" as const,
  "is-null" as const,
  "not-null" as const,
];

export const DATE_PICKER_OPERATORS = [
  ...SPECIFIC_DATE_PICKER_OPERATORS,
  ...EXCLUDE_DATE_PICKER_OPERATORS,
];

export const DATE_PICKER_SHORTCUTS = [
  "today" as const,
  "yesterday" as const,
  "previous-week" as const,
  "previous-7-days" as const,
  "previous-30-days" as const,
  "previous-month" as const,
  "previous-3-months" as const,
  "previous-12-months" as const,
];

export const DATE_PICKER_TRUNCATION_UNITS = [
  "minute" as const,
  "hour" as const,
  "day" as const,
  "week" as const,
  "month" as const,
  "quarter" as const,
  "year" as const,
];

export const DATE_PICKER_EXTRACTION_UNITS = [
  "hour-of-day" as const,
  "day-of-week" as const,
  "month-of-year" as const,
  "quarter-of-year" as const,
];

export const DATE_PICKER_UNITS = [
  ...DATE_PICKER_TRUNCATION_UNITS,
  ...DATE_PICKER_EXTRACTION_UNITS,
];

export const DATE_PICKER_DIRECTIONS = [
  "past" as const,
  "current" as const,
  "future" as const,
];
