import moment from "moment-timezone";

import MetabaseSettings from "metabase/lib/settings";

// when the start of week setting changes or gets a value, update the start of week used by Moment.js
let hasSetMomentStartOfWeek = false;

function updateMomentStartOfWeek(startOfWeekDayName) {
  if (!startOfWeekDayName) {
    return;
  }

  const START_OF_WEEK_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  let startOfWeekDayNumber = START_OF_WEEK_DAYS.indexOf(startOfWeekDayName);
  if (startOfWeekDayNumber === -1) {
    return;
  }

  moment.updateLocale(moment.locale(), {
    week: {
      // Moment.js dow range Sunday (0) - Saturday (6)
      dow: startOfWeekDayNumber,
    },
  });

  hasSetMomentStartOfWeek = true;
}

MetabaseSettings.on("user-locale", updateMomentStartOfWeek);
MetabaseSettings.on("start-of-week", updateMomentStartOfWeek);

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
      .weekday(value - 1)
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
export function parseTimestamp(value, unit = null, local = false) {
  // if Moment start of week hasn't been set yet for whatever reason then go ahead and do so now.
  if (!hasSetMomentStartOfWeek) {
    updateMomentStartOfWeek();
  }

  let m;
  if (moment.isMoment(value)) {
    m = value;
  } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    m = moment.parseZone(value);
  } else if (unit in NUMERIC_UNIT_FORMATS && typeof value == "number") {
    m = NUMERIC_UNIT_FORMATS[unit](value);
  } else {
    m = moment.utc(value);
  }
  return local ? m.local() : m;
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
