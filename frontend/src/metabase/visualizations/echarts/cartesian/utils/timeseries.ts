import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import _ from "underscore";

import { parseTimestamp } from "metabase/utils/time-dayjs";
import { isNotNull } from "metabase/utils/types";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  TimeSeriesAxisFormatter,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  multipleTimezoneWarning,
  unexpectedTimezoneWarning,
} from "metabase/visualizations/lib/warnings";
import type { ContinuousDomain } from "metabase/visualizations/shared/types/scale";
import type {
  DateTimeAbsoluteUnit,
  RawSeries,
  RowValue,
} from "metabase-types/api";

import type { ShowWarning } from "../../types";
import type { ChartLayout } from "../layout/types";
import { getPaddedAxisLabel } from "../option/utils";

export const tryGetDate = (rowValue: RowValue): Dayjs | null => {
  if (typeof rowValue === "boolean") {
    return null;
  }
  const date = parseTimestamp(rowValue);
  return date.isValid() ? date : null;
};

export const msToDays = (ms: number) => ms / (24 * 60 * 60 * 1000);

// mostly matches
// https://github.com/mbostock/d3/wiki/Time-Scales
// https://github.com/mbostock/d3/wiki/Time-Intervals
// Use UTC methods to avoid issues with daylight savings
// NOTE: smaller modulos within an interval type must be multiples of larger ones (e.x. can't do both 2 days and 7 days i.e. week)
//
// Count and time interval for axis.ticks()
//
export const TICKS_TIMESERIES_INTERVALS: (TimeSeriesInterval & {
  testFn?: (date: Dayjs) => number;
})[] = [
  { unit: "ms", count: 1, testFn: (_d: Dayjs) => 0 }, //  (0) millisecond
  { unit: "second", count: 1, testFn: (d: Dayjs) => d.millisecond() }, //  (1) 1 second
  { unit: "second", count: 5, testFn: (d: Dayjs) => d.second() % 5 }, //  (2) 5 seconds
  { unit: "second", count: 15, testFn: (d: Dayjs) => d.second() % 15 }, //  (3) 15 seconds
  { unit: "second", count: 30, testFn: (d: Dayjs) => d.second() % 30 }, //  (4) 30 seconds
  { unit: "minute", count: 1, testFn: (d: Dayjs) => d.second() }, //  (5) 1 minute
  { unit: "minute", count: 5, testFn: (d: Dayjs) => d.minute() % 5 }, //  (6) 5 minutes
  { unit: "minute", count: 15, testFn: (d: Dayjs) => d.minute() % 15 }, //  (7) 15 minutes
  { unit: "minute", count: 30, testFn: (d: Dayjs) => d.minute() % 30 }, //  (8) 30 minutes
  { unit: "hour", count: 1, testFn: (d: Dayjs) => d.minute() }, //  (9) 1 hour
  { unit: "hour", count: 3, testFn: (d: Dayjs) => d.hour() % 3 }, // (10) 3 hours
  { unit: "hour", count: 6, testFn: (d: Dayjs) => d.hour() % 6 }, // (11) 6 hours
  { unit: "hour", count: 12, testFn: (d: Dayjs) => d.hour() % 12 }, // (12) 12 hours
  { unit: "day", count: 1, testFn: (d: Dayjs) => d.hour() }, // (13) 1 day
  { unit: "week", count: 1, testFn: (d: Dayjs) => d.day() }, // (14) 1 week
  { unit: "week", count: 2 },
  { unit: "month", count: 1, testFn: (d: Dayjs) => d.date() }, // (15) 1 month
  { unit: "month", count: 2 },
  { unit: "quarter", count: 1, testFn: (d: Dayjs) => d.month() % 3 }, // (16) 3 months / 1 quarter
  { unit: "quarter", count: 2 },
  { unit: "year", count: 1, testFn: (d: Dayjs) => d.month() }, // (17) 1 year
  { unit: "year", count: 2, testFn: (d: Dayjs) => d.year() % 2 }, // (18) 2 year
  { unit: "year", count: 5 },
  { unit: "year", count: 10, testFn: (d: Dayjs) => d.year() % 10 }, // (19) 10 year
  { unit: "year", count: 50, testFn: (d: Dayjs) => d.year() % 50 }, // (20) 50 year
  { unit: "year", count: 100, testFn: (d: Dayjs) => d.year() % 100 }, // (21) 100 year
];

// we use some extra intervals in computeTimeseriesTicksInterval - the ones without testFn
// however, computeTimeseriesDataInterval requires that intervals be multiples of each other
// so we filter out those extra ones here
// see #43421
const DATA_TIMESERIES_INTERVALS: (TimeSeriesInterval & {
  testFn: (date: Dayjs) => number;
})[] = TICKS_TIMESERIES_INTERVALS.filter(
  (i): i is TimeSeriesInterval & { testFn: (date: Dayjs) => number } =>
    i.testFn != null,
);

// mapping from Metabase "unit" to d3 intervals above
const INTERVAL_INDEX_BY_UNIT: Record<DateTimeAbsoluteUnit, number> = {
  minute: 5,
  hour: 9,
  day: 13,
  week: 14,
  month: 15,
  quarter: 16,
  year: 17,
};

export function minTimeseriesUnit(
  units: (DateTimeAbsoluteUnit | null)[],
): DateTimeAbsoluteUnit | null {
  return units.reduce(
    (minUnit, unit) =>
      unit != null &&
      (minUnit == null ||
        INTERVAL_INDEX_BY_UNIT[unit] < INTERVAL_INDEX_BY_UNIT[minUnit])
        ? unit
        : minUnit,
    null,
  );
}

export function computeTimeseriesDataInterval(
  xValues: RowValue[],
  unit: DateTimeAbsoluteUnit | null,
) {
  xValues = xValues.filter(isNotNull);

  if (unit && INTERVAL_INDEX_BY_UNIT[unit] != null) {
    return DATA_TIMESERIES_INTERVALS[INTERVAL_INDEX_BY_UNIT[unit]];
  }

  // Always use 'day' when there's just one value.
  if (xValues.length === 1) {
    return DATA_TIMESERIES_INTERVALS.find((i) => i.unit === "day");
  }

  // run each interval's test function on each value
  const valueLists = xValues.map((xValue) => {
    const parsed = parseTimestamp(xValue);
    return DATA_TIMESERIES_INTERVALS.map((interval) => interval.testFn(parsed));
  });

  // count the number of different values for each interval
  const intervalCounts = _.zip(...valueLists).map((l) => new Set(l).size);

  // find the first interval that has multiple values. we'll subtract 1 to get the previous item later
  let index = intervalCounts.findIndex((size) => size !== 1);

  // special case to check: did we get tripped up by the week interval?
  const weekIndex = DATA_TIMESERIES_INTERVALS.findIndex(
    (i) => i.unit === "week",
  );
  if (index === weekIndex && intervalCounts[weekIndex + 1] === 1) {
    index = intervalCounts.findIndex(
      (size, index) => size !== 1 && index > weekIndex,
    );
  }

  // if we ran off the end of intervals, return the last one
  if (index === -1) {
    return DATA_TIMESERIES_INTERVALS[DATA_TIMESERIES_INTERVALS.length - 1];
  }

  // index currently points to the first item with multiple values, so move it to the previous interval
  return DATA_TIMESERIES_INTERVALS[index - 1];
}

// ------------------------- Computing the TIMESERIES_INTERVALS entry to use for a chart ------------------------- //

/// The number of milliseconds between each tick for an entry in TIMESERIES_INTERVALS.
/// For example a "5 seconds" interval would have a tick "distance" of 5000 milliseconds.
export function getTimeSeriesIntervalDuration(interval: TimeSeriesInterval) {
  // add COUNT number of INTERVALS to the UNIX timestamp 0. e.g. add '5 hours' to 0. Then get the new timestamp
  // (in milliseconds). Since we added to 0 this will be the interval between each tick
  return dayjs(0).add(interval.count, interval.unit).valueOf();
}

// Counts interval boundary crossings within the domain
export function expectedTickCount(
  interval: TimeSeriesInterval,
  xDomain: ContinuousDomain,
): number {
  const { unit, count } = interval;
  const start = dayjs.utc(xDomain[0]);
  const end = dayjs.utc(xDomain[1]);

  const startTrunc = start.startOf(unit);
  const endTrunc = end.startOf(unit);

  const diffUnits = endTrunc.diff(startTrunc, unit);

  let startIdx: number;
  if (unit === "year") {
    startIdx = startTrunc.year();
  } else if (unit === "quarter") {
    startIdx = startTrunc.quarter() - 1;
  } else if (unit === "month") {
    startIdx = startTrunc.month();
  } else if (unit === "week") {
    startIdx = startTrunc.week();
  } else if (unit === "day") {
    startIdx = startTrunc.day();
  } else if (unit === "hour") {
    startIdx = startTrunc.hour();
  } else if (unit === "minute") {
    startIdx = startTrunc.minute();
  } else if (unit === "second") {
    startIdx = startTrunc.second();
  } else {
    startIdx = startTrunc.valueOf();
  }

  const startAligned = Math.ceil(startIdx / count) * count;
  const endAligned = Math.floor((startIdx + diffUnits) / count) * count;

  const diffAligned = (endAligned - startAligned) / count;

  if (start.valueOf() === startTrunc.valueOf() || startIdx < startAligned) {
    return diffAligned + 1;
  }
  return diffAligned;
}

/// Get the appropriate tick interval option from the TIMESERIES_INTERVALS above based on the xAxis bucketing
/// and the max number of ticks we want to show (itself calculated from chart width).
export function computeTimeseriesTicksInterval(
  xDomain: ContinuousDomain,
  xInterval: TimeSeriesInterval,
  chartLayout: ChartLayout,
  formatter: TimeSeriesAxisFormatter,
) {
  const minTickCount = 2;
  // first we want to find out where in TIMESERIES_INTERVALS we should start looking for a good match. Find the
  // interval with a matching interval and count (e.g. `hour` and `1`) and we'll start there.
  let initialIndex = _.findIndex(
    TICKS_TIMESERIES_INTERVALS,
    ({ unit, count }) => {
      return unit === xInterval.unit && count === xInterval.count;
    },
  );
  // if we weren't able to find something matching then we'll start from the beginning and try everything
  if (initialIndex === -1) {
    initialIndex = 0;
  }

  // Fallback value: the largest tick interval (every 100 years)
  let intervalIndex = TICKS_TIMESERIES_INTERVALS.length - 1;

  // Looking for the first interval which produces less ticks than the maxTicksCount.
  // However, if it produces less than minTickCount ticks we prefer taking a smaller previous interval.
  for (let i = initialIndex; i < TICKS_TIMESERIES_INTERVALS.length; i++) {
    const interval = TICKS_TIMESERIES_INTERVALS[i];
    const maxTickCount = maxTicksForChartWidth(
      chartLayout,
      interval.unit,
      getFormatter(formatter, xInterval.unit, interval.unit),
    );
    const intervalTicksCount = expectedTickCount(interval, xDomain);

    if (intervalTicksCount > maxTickCount) {
      continue;
    }

    // finding an interval that produces less than maxTicksCount ticks
    if (intervalTicksCount <= maxTickCount) {
      // check if the interval produces less ticks than minTickCount
      const isTooSparse = intervalTicksCount < minTickCount;
      // if the interval produces too few ticks select the previous interval
      intervalIndex = isTooSparse ? Math.max(i - 1, 0) : i;
      break;
    }
  }

  return TICKS_TIMESERIES_INTERVALS[intervalIndex];
}

// Wrapping `formatter` with a "month" arg creates a fresh closure each call. Because `getFormatter`
// runs inside the per-interval loop in `computeTimeseriesTicksInterval`, this churn would defeat any
// downstream cache keyed on formatter identity. Memoize the wrapped formatter per source formatter so
// callers see a stable reference.
const monthWrappedFormatterCache = new WeakMap<
  TimeSeriesAxisFormatter,
  TimeSeriesAxisFormatter
>();

export function getFormatter(
  formatter: TimeSeriesAxisFormatter,
  dataUnit: CartesianChartDateTimeAbsoluteUnit,
  chartUnit: CartesianChartDateTimeAbsoluteUnit,
) {
  // If the data interval is week but due to available space and the range of the chart
  // we decide to show monthly, yearly or even larger ticks, we should format ticks values as months.
  if (dataUnit === "week" && chartUnit !== "week") {
    let wrapped = monthWrappedFormatterCache.get(formatter);
    if (!wrapped) {
      wrapped = (value: RowValue) => formatter(value, "month");
      monthWrappedFormatterCache.set(formatter, wrapped);
    }
    return wrapped;
  }
  return formatter;
}

const representativeDatesCache = new Map<
  CartesianChartDateTimeAbsoluteUnit,
  string[]
>();

function getCachedRepresentativeDates(
  unit: CartesianChartDateTimeAbsoluteUnit,
) {
  let dates = representativeDatesCache.get(unit);
  if (!dates) {
    dates = getRepresentativeDates(unit);
    representativeDatesCache.set(unit, dates);
  }
  return dates;
}

// Finding the longest formatted label for a unit means running the formatter over up to ~168 dates
// (12 months × 7 weekdays × 2 hours). The result depends only on (unit, formatter), so memoize it
// across calls and renders. Keyed on formatter identity via WeakMap, so entries are GC'd with the
// formatter.
const longestFormattedDateCache = new WeakMap<
  TimeSeriesAxisFormatter,
  Map<CartesianChartDateTimeAbsoluteUnit, string>
>();

function getLongestFormattedDate(
  unit: CartesianChartDateTimeAbsoluteUnit,
  formatter: TimeSeriesAxisFormatter,
) {
  let perFormatter = longestFormattedDateCache.get(formatter);
  if (!perFormatter) {
    perFormatter = new Map();
    longestFormattedDateCache.set(formatter, perFormatter);
  }
  const cached = perFormatter.get(unit);
  if (cached !== undefined) {
    return cached;
  }

  let longest = "";
  for (const date of getCachedRepresentativeDates(unit)) {
    const formatted = getPaddedAxisLabel(formatter(date));
    if (formatted.length > longest.length) {
      longest = formatted;
    }
  }
  perFormatter.set(unit, longest);
  return longest;
}

function maxTicksForChartWidth(
  chartLayout: ChartLayout,
  unit: CartesianChartDateTimeAbsoluteUnit,
  formatter: TimeSeriesAxisFormatter,
) {
  const availableWidth =
    chartLayout.outerWidth -
    chartLayout.padding.left -
    chartLayout.padding.right;
  const TICK_BUFFER_PIXELS = 10;
  const longestDate = getLongestFormattedDate(unit, formatter);
  const longestDateWidth =
    chartLayout.ticksDimensions.getXTickWidth(longestDate);
  return Math.floor(availableWidth / (longestDateWidth + TICK_BUFFER_PIXELS));
}

/**
 * Given a unit, returns an array of "representative" dates.
 * "representative" means that the date with the longest string representation for the unit is contained in the array.
 */
function getRepresentativeDates(unit: CartesianChartDateTimeAbsoluteUnit) {
  // the length of month names varies by locale
  let months: number[];
  if (unit === "year") {
    months = [0];
  } else if (unit === "quarter") {
    months = [0, 3, 6, 9];
  } else {
    months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }

  let days: number[];
  if (
    unit === "year" ||
    unit === "quarter" ||
    unit === "month" ||
    unit === "week"
  ) {
    days = [10]; // use a 2 digit day because it's longer
  } else {
    days = [10, 11, 12, 13, 14, 15, 16]; // test each possible weekday name
  }

  let hours: number[];
  if (
    unit === "year" ||
    unit === "quarter" ||
    unit === "month" ||
    unit === "week" ||
    unit === "day"
  ) {
    hours = [10]; // use a 2 digit hour because it's longer
  } else {
    hours = [10, 20]; // AM/PM length can vary by locale
  }
  const out: string[] = [];
  for (const month of months) {
    for (const day of days) {
      for (const hour of hours) {
        out.push(new Date(2026, month, day, hour).toISOString());
      }
    }
  }
  return out;
}

export function getLargestInterval(intervals: TimeSeriesInterval[]) {
  return intervals.reduce((largest, current) => {
    return getTimeSeriesIntervalDuration(current) >
      getTimeSeriesIntervalDuration(largest)
      ? current
      : largest;
  });
}

// Tests for offsets like +01:15, -09:45
const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

const tryParseOffsetMinutes = (maybeOffset: string): number | undefined => {
  const match = maybeOffset.match(OFFSET_PATTERN);

  if (!match) {
    return undefined;
  }

  const [, sign, hours, minutes] = match;
  const offsetSign = sign === "+" ? 1 : -1;
  const offsetHours = parseInt(hours, 10);
  const offsetMinutes = parseInt(minutes, 10);
  const totalOffsetMinutes = (offsetHours * 60 + offsetMinutes) * offsetSign;

  return totalOffsetMinutes;
};

// We should always have results_timezone, but just in case we fallback to UTC
export const DEFAULT_TIMEZONE = "Etc/UTC";

export function getTimezoneOrOffset(
  series: RawSeries,
  showWarning?: ShowWarning,
): { timezone?: string; offsetMinutes?: number } {
  // Dashboard multiseries cards might have series with different timezones.
  const timezones = Array.from(
    new Set(series.map((s) => s.data.results_timezone)),
  );
  if (timezones.length > 1) {
    showWarning?.(multipleTimezoneWarning(timezones).text);
  }
  // Warn if the query was run in an unexpected timezone.
  const { results_timezone, requested_timezone } = series[0].data;
  if (requested_timezone && requested_timezone !== results_timezone) {
    showWarning?.(
      unexpectedTimezoneWarning({ results_timezone, requested_timezone }).text,
    );
  }

  const offsetMinutes =
    results_timezone != null
      ? tryParseOffsetMinutes(results_timezone)
      : undefined;

  const timezone =
    offsetMinutes == null ? results_timezone || DEFAULT_TIMEZONE : undefined;

  return {
    timezone,
    offsetMinutes,
  };
}

export function normalizeDate(dayjsDate: Dayjs) {
  return dayjs
    .utc()
    .year(dayjsDate.year())
    .month(dayjsDate.month())
    .date(dayjsDate.date())
    .startOf("day");
}
