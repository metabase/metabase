export const dateTimeAbsoluteUnits = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export const dateTimeRelativeUnits = [
  "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
] as const;

export const dateTimeUnits = [
  ...dateTimeAbsoluteUnits,
  ...dateTimeRelativeUnits,
] as const;

export type DateTimeAbsoluteUnit = (typeof dateTimeAbsoluteUnits)[number];

export type DateTimeRelativeUnit = (typeof dateTimeRelativeUnits)[number];

export type DateTimeUnit =
  | "default"
  | DateTimeAbsoluteUnit
  | DateTimeRelativeUnit;
