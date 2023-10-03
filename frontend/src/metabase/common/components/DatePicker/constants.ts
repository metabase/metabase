import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerShortcut,
} from "./types";

export const DEFAULT_OPERATORS: DatePickerOperator[] = [
  "=",
  "!=",
  "<",
  ">",
  "between",
  "is-null",
  "not-null",
];

export const DEFAULT_SHORTCUTS: DatePickerShortcut[] = [
  "today",
  "yesterday",
  "last-week",
  "last-7-days",
  "last-30-days",
  "last-month",
  "last-3-months",
  "last-12-months",
];

export const DEFAULT_UNITS: DatePickerExtractionUnit[] = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
];
