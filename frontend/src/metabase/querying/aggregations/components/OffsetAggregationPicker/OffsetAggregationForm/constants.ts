import type { TemporalUnit } from "metabase-types/api";

export const OFFSET_UNITS: Partial<Record<TemporalUnit, TemporalUnit[]>> = {
  day: ["day", "day-of-week", "day-of-month", "day-of-year"],
  quarter: ["quarter", "quarter-of-year"],
  year: ["year"],
};
