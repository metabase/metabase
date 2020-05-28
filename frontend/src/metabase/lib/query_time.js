import moment from "moment";
import inflection from "inflection";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";
import { t, ngettext, msgid } from "ttag";

export const DATETIME_UNITS = [
  // "default",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  // "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  // "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export function computeFilterTimeRange(filter) {
  let expandedFilter;
  if (filter[0] === "time-interval") {
    expandedFilter = expandTimeIntervalFilter(filter);
  } else {
    expandedFilter = filter;
  }

  const [operator, field, ...values] = expandedFilter;
  const bucketing = parseFieldBucketing(field, "day");

  let start, end;
  if (operator === "=" && values[0]) {
    const point = absolute(values[0]);
    start = point.clone().startOf(bucketing);
    end = point.clone().endOf(bucketing);
  } else if (operator === ">" && values[0]) {
    start = absolute(values[0]).endOf(bucketing);
    end = max();
  } else if (operator === "<" && values[0]) {
    start = min();
    end = absolute(values[0]).startOf(bucketing);
  } else if (operator === "between" && values[0] && values[1]) {
    start = absolute(values[0]).startOf(bucketing);
    end = absolute(values[1]).endOf(bucketing);
  }

  return [start, end];
}

export function expandTimeIntervalFilter(filter) {
  let [operator, field, n, unit] = filter;

  if (operator !== "time-interval") {
    throw new Error("translateTimeInterval expects operator 'time-interval'");
  }

  if (n === "current") {
    n = 0;
  } else if (n === "last") {
    n = -1;
  } else if (n === "next") {
    n = 1;
  }

  field = ["datetime-field", field, unit];

  if (n < -1) {
    return [
      "between",
      field,
      ["relative-datetime", n - 1, unit],
      ["relative-datetime", -1, unit],
    ];
  } else if (n > 1) {
    return [
      "between",
      field,
      ["relative-datetime", 1, unit],
      ["relative-datetime", n, unit],
    ];
  } else if (n === 0) {
    return ["=", field, ["relative-datetime", "current"]];
  } else {
    return ["=", field, ["relative-datetime", n, unit]];
  }
}

export function generateTimeFilterValuesDescriptions(filter) {
  const [operator, field, ...values] = filter;
  const bucketing = parseFieldBucketing(field);

  if (operator === "time-interval") {
    const [n, unit] = values;
    return generateTimeIntervalDescription(n, unit);
  } else {
    return values.map(value => generateTimeValueDescription(value, bucketing));
  }
}

export function generateTimeIntervalDescription(n, unit) {
  if (unit === "day") {
    switch (n) {
      case "current":
      case 0:
        return [t`Today`];
      case "next":
      case 1:
        return [t`Tomorrow`];
      case "last":
      case -1:
        return [t`Yesterday`];
    }
  }

  if (!unit && n === 0) {
    return t`Today`;
  } // ['relative-datetime', 'current'] is a legal MBQL form but has no unit

  switch (n) {
    case "current":
    case 0:
      return [t`This ${formatBucketing(unit)}`];
    case "next":
    case 1:
      return [t`Next ${formatBucketing(unit)}`];
    case "last":
    case -1:
      return [t`Previous ${formatBucketing(unit)}`];
  }

  if (n < 0) {
    return [t`Previous ${-n} ${formatBucketing(unit, -n)}`];
  } else if (n > 0) {
    return [t`Next ${n} ${formatBucketing(unit, n)}`];
  } else {
    return [t`This ${formatBucketing(unit)}`];
  }
}

export function generateTimeValueDescription(value, bucketing) {
  if (typeof value === "string") {
    const m = parseTimestamp(value, bucketing);
    if (bucketing) {
      return formatDateTimeWithUnit(value, bucketing);
    } else if (m.hours() || m.minutes()) {
      return m.format("MMMM D, YYYY hh:mm a");
    } else {
      return m.format("MMMM D, YYYY");
    }
  } else if (Array.isArray(value) && value[0] === "relative-datetime") {
    let n = value[1];
    let unit = value[2];

    if (n === "current") {
      n = 0;
      unit = bucketing;
    }

    if (bucketing === unit) {
      return generateTimeIntervalDescription(n, unit);
    } else {
      // FIXME: what to do if the bucketing and unit don't match?
      if (n === 0) {
        return t`Now`;
      } else {
        return n < 0
          ? t`${-n} ${formatBucketing(unit, -n).toLowerCase()} ago`
          : t`${n} ${formatBucketing(unit, n).toLowerCase()} from now`;
      }
    }
  } else {
    console.warn("Unknown datetime format", value);
    return `[${t`Unknown`}]`;
  }
}

export function formatBucketing(bucketing = "", n = 1) {
  if (!bucketing) {
    return "";
  }
  switch (bucketing) {
    case "default":
      return ngettext(msgid`Default period`, `Default periods`, n);
    case "minute":
      return ngettext(msgid`Minute`, `Minutes`, n);
    case "hour":
      return ngettext(msgid`Hour`, `Hours`, n);
    case "day":
      return ngettext(msgid`Day`, `Days`, n);
    case "week":
      return ngettext(msgid`Week`, `Weeks`, n);
    case "month":
      return ngettext(msgid`Month`, `Months`, n);
    case "quarter":
      return ngettext(msgid`Quarter`, `Quarters`, n);
    case "year":
      return ngettext(msgid`Year`, `Years`, n);
    case "minute-of-hour":
      return ngettext(msgid`Minute of hour`, `Minutes of hour`, n);
    case "hour-of-day":
      return ngettext(msgid`Hour of day`, `Hours of day`, n);
    case "day-of-week":
      return ngettext(msgid`Day of week`, `Days of week`, n);
    case "day-of-month":
      return ngettext(msgid`Day of month`, `Days of month`, n);
    case "day-of-year":
      return ngettext(msgid`Day of year`, `Days of year`, n);
    case "week-of-year":
      return ngettext(msgid`Week of year`, `Weeks of year`, n);
    case "month-of-year":
      return ngettext(msgid`Month of year`, `Months of year`, n);
    case "quarter-of-year":
      return ngettext(msgid`Quarter of year`, `Quarters of year`, n);
  }
  const words = bucketing.split("-");
  words[0] = inflection.capitalize(words[0]);
  return words.join(" ");
}

export function absolute(date) {
  if (typeof date === "string") {
    return moment(date);
  } else if (Array.isArray(date) && date[0] === "relative-datetime") {
    return moment().add(date[1], date[2]);
  } else {
    console.warn("Unknown datetime format", date);
  }
}

export function parseFieldBucketing(field, defaultUnit = null) {
  if (Array.isArray(field)) {
    if (field[0] === "datetime-field") {
      if (field.length === 4) {
        // Deprecated legacy format [datetime-field field "as" unit], see DatetimeFieldDimension for more info
        return field[3];
      } else {
        // Current format [datetime-field field unit]
        return field[2];
      }
    }
    if (field[0] === "fk->" || field[0] === "field-id") {
      return defaultUnit;
    }
    if (field[0] === "field-literal") {
      return defaultUnit;
    } else {
      console.warn("Unknown field format", field);
    }
  }
  return defaultUnit;
}

// returns field with "datetime-field" removed
export function parseFieldTarget(field) {
  if (field[0] === "datetime-field") {
    return field[1];
  } else {
    return field;
  }
}

export function parseFieldTargetId(field) {
  if (Number.isInteger(field)) {
    return field;
  }

  if (Array.isArray(field)) {
    if (field[0] === "field-id") {
      return field[1];
    }
    if (field[0] === "fk->") {
      return parseFieldTargetId(field[1]);
    }
    if (field[0] === "datetime-field") {
      return parseFieldTargetId(field[1]);
    }
    if (field[0] === "field-literal") {
      return field;
    }
  }

  console.warn("Unknown field format", field);
  return field;
}

// 271821 BC and 275760 AD and should be far enough in the past/future
function max() {
  return moment(new Date(864000000000000));
}

function min() {
  return moment(new Date(-864000000000000));
}
