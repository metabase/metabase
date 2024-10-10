import type { TemporalUnit } from "metabase-types/api";

export const OFFSET_UNITS: Partial<Record<TemporalUnit, TemporalUnit[]>> = {
  minute: ["minute", "minute-of-hour"],
  hour: ["hour", "hour-of-day"],
  day: ["day", "day-of-week", "day-of-month", "day-of-year"],
  week: ["week", "week-of-year"],
  month: ["month", "month-of-year"],
  quarter: ["quarter", "quarter-of-year"],
  year: ["year"],
};
