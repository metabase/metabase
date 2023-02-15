import type { DatetimeUnit } from "metabase-types/api/query";

const UNITS_WITH_HOUR = ["default", "minute", "hour", "hour-of-day"] as const;
const UNITS_WITH_DAY = ["default", "minute", "hour", "day", "week"] as const;

type UNITS_WITH_HOUR_TYPE = typeof UNITS_WITH_HOUR[number];
type UNITS_WITH_DAY_TYPE = typeof UNITS_WITH_DAY[number];

const UNITS_WITH_HOUR_SET = new Set(UNITS_WITH_HOUR);
const UNITS_WITH_DAY_SET = new Set(UNITS_WITH_DAY);

export const hasDay = (unit: DatetimeUnit) =>
  unit == null || UNITS_WITH_DAY_SET.has(unit as UNITS_WITH_DAY_TYPE);

export const hasHour = (unit: DatetimeUnit) =>
  unit == null || UNITS_WITH_HOUR_SET.has(unit as UNITS_WITH_HOUR_TYPE);
