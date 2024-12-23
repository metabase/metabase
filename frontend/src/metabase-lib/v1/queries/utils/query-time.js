import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";
import _ from "underscore";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";
import * as Lib from "metabase-lib";
import { FieldDimension } from "metabase-lib/v1/Dimension";
import {
  isAfterDateFilter,
  isBeforeDateFilter,
  isBetweenFilter,
  isCurrentDateFilter,
  isExcludeDateFilter,
  isNextDateFilter,
  isOnDateFilter,
  isPreviousDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";

export const DATETIME_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export function generateTimeFilterValuesDescriptions(filter) {
  const [operator, field, ...values] = filter;
  const bucketing = parseFieldBucketing(field);

  if (operator === "time-interval") {
    const [n, unit] = values;
    return [Lib.describeTemporalInterval(n, unit)];
  } else if (isStartingFrom(filter)) {
    const [interval, unit] = getRelativeDatetimeInterval(filter);
    const prefix = Lib.describeTemporalInterval(interval, unit);
    const startingFrom = getStartingFrom(filter);
    if (!startingFrom) {
      return [prefix];
    }
    const [n, bucketing] = startingFrom;
    const suffix = formatStartingFrom(bucketing, -n);
    return [t`${prefix}, starting ${Math.abs(n)} ${suffix}`];
  } else {
    return values.map(value =>
      generateTimeValueDescription(value, bucketing, operator === "!="),
    );
  }
}

function generateTimeValueDescription(value, bucketing, isExclude) {
  if (typeof value === "number" && bucketing === "hour-of-day") {
    return moment().hour(value).format("h A");
  } else if (typeof value === "string") {
    const m = parseTimestamp(value, bucketing);
    if (bucketing) {
      return formatDateTimeWithUnit(value, bucketing, { isExclude });
    } else if (m.hours() || m.minutes()) {
      return m.format("MMMM D, YYYY hh:mm A");
    } else {
      return m.format("MMMM D, YYYY");
    }
  } else if (isRelativeDatetime(value)) {
    let [n, unit] = value;

    if (n === "current") {
      n = 0;
      unit = bucketing;
    }

    return bucketing === unit
      ? Lib.describeTemporalInterval(n, unit)
      : Lib.describeRelativeDatetime(n, unit);
  } else {
    console.warn("Unknown datetime format", value);
    return `[${t`Unknown`}]`;
  }
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

/**
 * Return the temporal bucketing unit for a `:field` MBQL clause
 */
export function parseFieldBucketing(field, defaultUnit = null) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  const isStartingFromExpr = field?.[0] === "+" && field?.[1]?.[0] === "field";
  if (dimension) {
    return dimension.temporalUnit() || defaultUnit;
  } else if (isStartingFromExpr) {
    return parseFieldBucketing(field[1], defaultUnit);
  }
  return defaultUnit;
}

export function isRelativeDatetime(value) {
  return Array.isArray(value) && value[0] === "relative-datetime";
}

function isInterval(mbql) {
  if (!Array.isArray(mbql)) {
    return false;
  }
  const [op, num, unit] = mbql;
  return (
    op === "interval" &&
    typeof num === "number" &&
    DATETIME_UNITS.indexOf(unit) > -1
  );
}

export function isStartingFrom(mbql) {
  if (!Array.isArray(mbql)) {
    return false;
  }

  const [op, expr, left, right] = mbql;
  if (
    isRelativeDatetime(left) &&
    Array.isArray(expr) &&
    ((op === "between" && isRelativeDatetime(right)) || op === "=")
  ) {
    const [innerOp, _field, interval] = expr;
    if (innerOp === "+" && isInterval(interval)) {
      return true;
    }
  }

  return false;
}

export function getStartingFrom(mbql) {
  if (!isStartingFrom(mbql)) {
    return null;
  }

  const [_op, expr, _left, _right] = mbql;
  const [_expr, _field, interval] = expr;
  const [_interval, num, unit] = interval;
  return [num, unit];
}

export function formatStartingFrom(unit, n) {
  const unitText = Lib.describeTemporalUnit(unit, n).toLowerCase();
  return n >= 0 ? t`${unitText} from now` : t`${unitText} ago`;
}

function getTimeInterval(mbql) {
  if (Array.isArray(mbql) && mbql[0] === "time-interval") {
    return [mbql[1], mbql[2], mbql[3] || "day"];
  }
  return null;
}

export function setStartingFrom(mbql, num, unit) {
  unit = unit && unit !== "none" ? unit : null;
  if (isStartingFrom(mbql)) {
    const [op, expr, left, right] = mbql;
    const [exprOp, field, interval] = expr;
    const [intervalOp, _num, originalUnit] = interval;
    const newUnit = unit || originalUnit;
    const newExpr = [
      exprOp,
      field,
      [intervalOp, num ?? getDefaultDatetimeValue(newUnit), newUnit],
    ];
    return op === "=" ? [op, newExpr, left] : [op, newExpr, left, right];
  }

  const interval = getTimeInterval(mbql);
  if (interval) {
    const [field, intervalNum, intervalUnit] = interval;
    const newUnit = unit || intervalUnit;
    let newValue = num;
    if (typeof newValue !== "number") {
      newValue = (intervalNum < 0 ? 1 : -1) * getDefaultDatetimeValue(newUnit);
    }
    const expr = ["+", field, ["interval", newValue, newUnit]];
    const newInterval = ["relative-datetime", intervalNum, intervalUnit];
    const zeroed = ["relative-datetime", 0, intervalUnit];
    const left = intervalNum < 0 ? newInterval : zeroed;
    const right = intervalNum < 0 ? zeroed : newInterval;
    return ["between", expr, left, right];
  }

  return mbql;
}

function getDefaultDatetimeValue(unit, isDefault = false) {
  switch (unit) {
    case "minute":
      return 60;
    case "hour":
      return 24;
    case "day":
      return isDefault ? 30 : 7;
    case "week":
      return 4;
    case "month":
      return 3;
    case "quarter":
      return 4;
    case "year":
      return 1;
  }
}

export function getRelativeDatetimeInterval(filter) {
  if (isStartingFrom(filter)) {
    const [_op, _field, [_left, leftNum, unit], right] = filter;
    if (right) {
      const [_right, rightNum] = right;
      return [
        leftNum < 0 ? leftNum : rightNum,
        unit && unit !== "none" ? unit : "day",
      ];
    } else {
      return [leftNum, unit];
    }
  } else if (filter[0] === "time-interval") {
    const unit = filter[3];
    return [filter[2], unit && unit !== "none" ? unit : "day"];
  }

  return [null, null];
}

const getMomentDateForSerialization = date => {
  return date.clone().locale("en");
};

export const DATE_OPERATORS = [
  {
    name: "previous",
    displayName: t`Previous`,
    test: filter => isPreviousDateFilter(filter),
  },
  {
    name: "current",
    displayName: t`Current`,
    test: filter => isCurrentDateFilter(filter),
  },
  {
    name: "next",
    displayName: t`Next`,
    test: filter => isNextDateFilter(filter),
  },
  {
    name: "between",
    displayName: t`Between`,
    test: filter => isBetweenFilter(filter),
  },
  {
    name: "before",
    displayName: t`Before`,
    test: filter => isBeforeDateFilter(filter),
  },
  {
    name: "on",
    displayName: t`On`,
    test: filter => isOnDateFilter(filter),
  },
  {
    name: "after",
    displayName: t`After`,
    test: filter => isAfterDateFilter(filter),
  },
  {
    name: "exclude",
    displayName: t`Exclude...`,
    displayPrefix: t`Exclude`,
    test: filter => isExcludeDateFilter(filter),
  },
];

export const EXCLUDE_UNITS = {
  days: "day-of-week",
  months: "month-of-year",
  quarters: "quarter-of-year",
  hours: "hour-of-day",
};

export const EXCLUDE_OPTIONS = {
  [EXCLUDE_UNITS["days"]]: () => {
    const now = moment().utc().hours(0).minutes(0).seconds(0).milliseconds(0);
    return [
      _.range(0, 7).map(day => {
        const date = now.day(day + 1);
        const displayName = date.format("dddd");
        const value = date.format("YYYY-MM-DD");
        return {
          displayName,
          value,
          serialized: getMomentDateForSerialization(date).format("ddd"),
          test: val => value === val,
        };
      }),
    ];
  },
  [EXCLUDE_UNITS["months"]]: () => {
    const now = moment()
      .utc()
      .date(1)
      .hours(0)
      .minutes(0)
      .seconds(0)
      .milliseconds(0);
    const func = month => {
      const date = now.month(month);
      const displayName = date.format("MMMM");
      const value = date.format("YYYY-MM-DD");
      return {
        displayName,
        value,
        serialized: getMomentDateForSerialization(date).format("MMM"),
        test: value => moment(value).format("MMMM") === displayName,
      };
    };
    return [_.range(0, 6).map(func), _.range(6, 12).map(func)];
  },
  [EXCLUDE_UNITS["quarters"]]: () => {
    const now = moment().utc().hours(0).minutes(0).seconds(0).milliseconds(0);
    const suffix = " " + t`quarter`;
    return [
      _.range(1, 5).map(quarter => {
        const date = now.quarter(quarter);
        const displayName = date.format("Qo");
        const value = date.format("YYYY-MM-DD");
        return {
          displayName: displayName + suffix,
          value,
          serialized: getMomentDateForSerialization(date).format("Q"),
          test: value => moment(value).format("Qo") === displayName,
        };
      }),
    ];
  },
  [EXCLUDE_UNITS["hours"]]: () => {
    const now = moment().utc().minutes(0).seconds(0).milliseconds(0);
    const func = hour => {
      const date = now.hour(hour);
      const displayName = date.format("h A");
      return {
        displayName,
        value: hour,
        serialized: hour.toString(),
        test: value => value === hour,
      };
    };
    return [_.range(0, 12).map(func), _.range(12, 24).map(func)];
  },
};
