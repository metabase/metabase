export const DEFAULT_TIME_STYLE = "h:mm A";

const UNITS_WITH_HOUR = ["default", "minute", "hour", "hour-of-day"];
const UNITS_WITH_DAY = ["default", "minute", "hour", "day", "week"];

const UNITS_WITH_HOUR_SET = new Set(UNITS_WITH_HOUR);
const UNITS_WITH_DAY_SET = new Set(UNITS_WITH_DAY);

export const hasDay = unit => unit == null || UNITS_WITH_DAY_SET.has(unit);

export const hasHour = unit => unit == null || UNITS_WITH_HOUR_SET.has(unit);

export function getTimeFormatFromStyle(style, unit, timeEnabled) {
  const format = style;
  if (!timeEnabled || timeEnabled === "milliseconds") {
    return format.replace(/mm/, "mm:ss.SSS");
  } else if (timeEnabled === "seconds") {
    return format.replace(/mm/, "mm:ss");
  } else {
    return format;
  }
}
