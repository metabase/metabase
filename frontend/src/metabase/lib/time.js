import moment from "moment";

const NUMERIC_UNIT_FORMATS = {
  // workaround for https://github.com/metabase/metabase/issues/1992
  year: value =>
    moment()
      .year(value)
      .startOf("year"),
  "minute-of-hour": value =>
    moment()
      .minute(value)
      .startOf("minute"),
  "hour-of-day": value =>
    moment()
      .hour(value)
      .startOf("hour"),
  "day-of-week": value =>
    moment()
      .day(value - 1)
      .startOf("day"),
  "day-of-month": value =>
    moment("2016-01-01") // initial date must be in month with 31 days to format properly
      .date(value)
      .startOf("day"),
  "day-of-year": value =>
    moment("2016-01-01") // initial date must be in leap year to format properly
      .dayOfYear(value)
      .startOf("day"),
  "week-of-year": value =>
    moment()
      .week(value)
      .startOf("week"),
  "month-of-year": value =>
    moment()
      .month(value - 1)
      .startOf("month"),
  "quarter-of-year": value =>
    moment()
      .quarter(value)
      .startOf("quarter"),
};

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
export function parseTimestamp(value, unit) {
  if (moment.isMoment(value)) {
    return value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    return moment.parseZone(value);
  } else if (unit in NUMERIC_UNIT_FORMATS) {
    return NUMERIC_UNIT_FORMATS[unit](value);
  } else {
    return moment.utc(value);
  }
}

export function parseTime(value) {
  if (moment.isMoment(value)) {
    return value;
  } else if (typeof value === "string") {
    return moment.parseZone(value, [
      "HH:mm:SS.sssZZ",
      "HH:mm:SS.sss",
      "HH:mm:SS.sss",
      "HH:mm:SS",
      "HH:mm",
    ]);
  } else {
    return moment.utc(value);
  }
}

// changeOffset takes a datetime and moves it between UTC offsets without
// changing the date or time.
//
// This function is only useful if `d` is missing timezone info (e.g. a
// javascript Date object). If you have a moment object to begin with, you can
// just call `.utcOffset(newOffset, true)` directly
//
// changeOffset(new Date("2019-08-01T00:00:00-02:00"), -2, 2).format()
// => "2019-08-01T00:00:00+02:00"
export function changeOffset(d, oldOffset, newOffset) {
  return moment(d)
    .utcOffset(oldOffset, false)
    .utcOffset(newOffset, true);
}
