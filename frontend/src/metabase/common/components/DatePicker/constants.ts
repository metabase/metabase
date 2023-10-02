import type { DatePickerExtractionUnit, DatePickerOperator } from "./types";

export const DEFAULT_OPERATORS: DatePickerOperator[] = [
  "=",
  "!=",
  "<",
  ">",
  "between",
  "is-null",
  "not-null",
];

export const DEFAULT_UNITS: DatePickerExtractionUnit[] = [
  "hour-of-day",
  "day-of-week",
  "month-of-year",
  "quarter-of-year",
];
