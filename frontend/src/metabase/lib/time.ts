import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import type { DatetimeUnit } from "metabase-types/api/query";

addAbbreviatedLocale();

// NOTE for developer:
// this file is deprecated, do not modify it unless it is really necessary
// use ./time-dayjs.ts instead

const TIME_FORMAT_24_HOUR = "HH:mm";

const TEXT_UNIT_FORMATS = {
  "day-of-week": (value: string) => {
    const day = moment.parseZone(value, "ddd").startOf("day");
    return day.isValid() ? day : moment.parseZone(value).startOf("day");
  },
};

const NUMERIC_UNIT_FORMATS = {
  // workaround for https://github.com/metabase/metabase/issues/1992
  "minute-of-hour": (value: number) => moment().minute(value).startOf("minute"),
  "hour-of-day": (value: number) => moment().hour(value).startOf("hour"),
  "day-of-week": (value: number) =>
    moment()
      .weekday(value - 1)
      .startOf("day"),
  "day-of-month": (value: number) =>
    moment("2016-01-01") // initial date must be in month with 31 days to format properly
      .date(value)
      .startOf("day"),
  "day-of-year": (value: number) =>
    moment("2016-01-01") // initial date must be in leap year to format properly
      .dayOfYear(value)
      .startOf("day"),
  "week-of-year": (value: number) =>
    moment("2016-01-01") // initial date must be in a year with 53 iso weeks to format properly
      .isoWeek(value) // set the iso week number to not depend on the first day of week
      .startOf("isoWeek"),
  "month-of-year": (value: number) =>
    moment()
      .month(value - 1)
      .startOf("month"),
  "quarter-of-year": (value: number) =>
    moment().quarter(value).startOf("quarter"),
  year: (value: number) => moment().year(value).startOf("year"),
};

// when you define a custom locale, moment automatically makes it the active global locale,
// so we need to return to the user's initial locale.
// also, you can't define a custom locale on a local instance
function addAbbreviatedLocale() {
  const initialLocale = moment.locale();

  moment.locale("en-abbreviated", {
    relativeTime: {
      future: "in %s",
      past: "%s",
      s: t`just now`,
      ss: t`just now`,
      m: "%d m",
      mm: "%d m",
      h: "%d h",
      hh: "%d h",
      d: "%d d",
      dd: "%d d",
      w: "%d wk",
      ww: "%d wks",
      M: "a mth",
      MM: "%d mths",
      y: "%d y",
      yy: "%d y",
    },
  });

  moment.locale(initialLocale);
}

function getTimeStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.time_style;
}

export function has24HourModeSetting() {
  const timeStyle = getTimeStyleFromSettings();
  return timeStyle === TIME_FORMAT_24_HOUR;
}

export function parseTime(value: moment.Moment | string) {
  if (moment.isMoment(value)) {
    return value;
  } else if (typeof value === "string") {
    // removing the timezone part if it exists, so we can parse the time correctly
    return moment(value.split(/[+-]/)[0], [
      "HH:mm:ss.SSSZ",
      "HH:mm:ss.SSS",
      "HH:mm:ss",
      "HH:mm:ss",
      "HH:mm",
    ]);
  }

  return moment.utc(value);
}

type NUMERIC_UNIT_FORMATS_KEY_TYPE =
  | "minute-of-hour"
  | "hour-of-day"
  | "day-of-week"
  | "day-of-month"
  | "day-of-year"
  | "week-of-year"
  | "month-of-year"
  | "quarter-of-year"
  | "year";

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
/**
 * @deprecated use dayjs version from ./time-dayjs.ts
 */
export function parseTimestamp(
  value: any,
  unit: DatetimeUnit | null = null,
  isLocal = false,
) {
  let m: any;
  if (moment.isMoment(value)) {
    m = value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    m = moment.parseZone(value);
  } else if (unit && unit in TEXT_UNIT_FORMATS && typeof value === "string") {
    m = TEXT_UNIT_FORMATS[unit as "day-of-week"](value);
  } else if (unit && unit in NUMERIC_UNIT_FORMATS && typeof value == "number") {
    m = NUMERIC_UNIT_FORMATS[unit as NUMERIC_UNIT_FORMATS_KEY_TYPE](value);
  } else if (typeof value === "number") {
    m = moment.utc(value, moment.ISO_8601);
  } else {
    m = moment.utc(value);
  }
  return isLocal ? m.local() : m;
}
