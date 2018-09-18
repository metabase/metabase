const DEFAULT_DATE_FORMATS = {
  year: "YYYY",
  quarter: "[Q]Q - YYYY",
  "minute-of-hour": "m",
  "hour-of-day": "h A",
  "day-of-week": "dddd",
  "day-of-month": "D",
  "day-of-year": "DDD",
  "week-of-year": "wo",
  "month-of-year": "MMMM",
  "quarter-of-year": "[Q]Q",
};

// a "date style" is essentially a "day" format with overrides for larger units
const DATE_STYLE_TO_FORMAT = {
  "M/D/YY": {
    month: "M/YY",
  },
  "D/M/YY": {
    month: "M/YY",
  },
  "YYYY/M/D": {
    month: "YYYY/M",
    quarter: "YYYY - [Q]Q",
  },
  "MMMM D, YYYY": {
    month: "MMMM, YYYY",
  },
  "D MMMM, YYYY": {
    month: "MMMM, YYYY",
  },
  "dddd, MMMM D, YYYY": {
    week: "MMMM D, YYYY",
    month: "MMMM, YYYY",
  },
};

export const DEFAULT_DATE_STYLE = "MMMM D, YYYY";

export function getDateFormatFromStyle(style, unit) {
  if (DATE_STYLE_TO_FORMAT[style]) {
    if (DATE_STYLE_TO_FORMAT[style][unit]) {
      return DATE_STYLE_TO_FORMAT[style][unit];
    }
  } else {
    console.warn("Unknown date style", style);
  }
  if (DEFAULT_DATE_FORMATS[unit]) {
    return DEFAULT_DATE_FORMATS[unit];
  }
  return style;
}

const UNITS_WITH_HOUR = [null, "default", "second", "minute", "hour"];
const UNITS_WITH_DAY = [...UNITS_WITH_HOUR, "day", "week"];

const UNITS_WITH_HOUR_SET = new Set(UNITS_WITH_HOUR);
const UNITS_WITH_DAY_SET = new Set(UNITS_WITH_DAY);

export const hasHour = unit => UNITS_WITH_HOUR_SET.has(unit);
export const hasDay = unit => UNITS_WITH_DAY_SET.has(unit);

export const DEFAULT_TIME_STYLE = "h:mm A";

export function getTimeFormatFromStyle(style, unit, timeEnabled) {
  let format = style;
  if (!timeEnabled || timeEnabled === "milliseconds") {
    return format.replace(/mm/, "mm:ss.SSS");
  } else if (timeEnabled === "seconds") {
    return format.replace(/mm/, "mm:ss");
  } else {
    return format;
  }
}
