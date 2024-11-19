import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import _ from "underscore";

import { parseTimestamp } from "metabase/lib/time-dayjs";
import { isNotNull } from "metabase/lib/types";
import type { TimeSeriesInterval } from "metabase/visualizations/echarts/cartesian/model/types";
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
export const TIMESERIES_INTERVALS: (TimeSeriesInterval & {
  testFn: (date: Dayjs) => number;
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
  { unit: "month", count: 1, testFn: (d: Dayjs) => d.date() }, // (15) 1 month
  { unit: "month", count: 3, testFn: (d: Dayjs) => d.month() % 3 }, // (16) 3 months / 1 quarter
  { unit: "year", count: 1, testFn: (d: Dayjs) => d.month() }, // (17) 1 year
  { unit: "year", count: 2, testFn: (d: Dayjs) => d.year() % 2 }, // (18) 2 year
  { unit: "year", count: 10, testFn: (d: Dayjs) => d.year() % 10 }, // (19) 10 year
  { unit: "year", count: 50, testFn: (d: Dayjs) => d.year() % 50 }, // (20) 50 year
  { unit: "year", count: 100, testFn: (d: Dayjs) => d.year() % 100 }, // (21) 100 year
];

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

export function computeTimeseriesDataInverval(
  xValues: RowValue[],
  unit: DateTimeAbsoluteUnit | null,
) {
  xValues = xValues.filter(isNotNull);

  if (unit && INTERVAL_INDEX_BY_UNIT[unit] != null) {
    return TIMESERIES_INTERVALS[INTERVAL_INDEX_BY_UNIT[unit]];
  }

  // Always use 'day' when there's just one value.
  if (xValues.length === 1) {
    return TIMESERIES_INTERVALS.find(i => i.unit === "day");
  }

  // run each interval's test function on each value
  const valueLists = xValues.map(xValue => {
    const parsed = parseTimestamp(xValue);
    return TIMESERIES_INTERVALS.map(interval => interval.testFn(parsed));
  });

  // count the number of different values for each interval
  const intervalCounts = _.zip(...valueLists).map(l => new Set(l).size);

  // find the first interval that has multiple values. we'll subtract 1 to get the previous item later
  let index = intervalCounts.findIndex(size => size !== 1);

  // special case to check: did we get tripped up by the week interval?
  const weekIndex = TIMESERIES_INTERVALS.findIndex(i => i.unit === "week");
  if (index === weekIndex && intervalCounts[weekIndex + 1] === 1) {
    index = intervalCounts.findIndex(
      (size, index) => size !== 1 && index > weekIndex,
    );
  }

  // if we ran off the end of intervals, return the last one
  if (index === -1) {
    return TIMESERIES_INTERVALS[TIMESERIES_INTERVALS.length - 1];
  }

  // index currently points to the first item with multiple values, so move it to the previous interval
  return TIMESERIES_INTERVALS[index - 1];
}

// ------------------------- Computing the TIMESERIES_INTERVALS entry to use for a chart ------------------------- //

/// The number of milliseconds between each tick for an entry in TIMESERIES_INTERVALS.
/// For example a "5 seconds" interval would have a tick "distance" of 5000 milliseconds.
export function getTimeSeriesIntervalDuration(interval: TimeSeriesInterval) {
  // add COUNT number of INTERVALS to the UNIX timestamp 0. e.g. add '5 hours' to 0. Then get the new timestamp
  // (in milliseconds). Since we added to 0 this will be the interval between each tick
  return dayjs(0).add(interval.count, interval.unit).valueOf();
}

/// Return the number of ticks we can expect to see over a time range using the TIMESERIES_INTERVALS entry interval.
/// for example a "5 seconds" interval over a time range of a minute should have an expected tick count of 20.
function expectedTickCount(
  interval: TimeSeriesInterval,
  timeRangeMilliseconds: number,
) {
  return Math.ceil(
    timeRangeMilliseconds / getTimeSeriesIntervalDuration(interval),
  );
}

/// Get the appropriate tick interval option from the TIMESERIES_INTERVALS above based on the xAxis bucketing
/// and the max number of ticks we want to show (itself calculated from chart width).
function timeseriesTicksInterval(
  xInterval: TimeSeriesInterval,
  timeRangeMilliseconds: number,
  maxTickCount: number,
  minTickCount: number = 2,
) {
  // first we want to find out where in TIMESERIES_INTERVALS we should start looking for a good match. Find the
  // interval with a matching interval and count (e.g. `hour` and `1`) and we'll start there.
  let initialIndex = _.findIndex(TIMESERIES_INTERVALS, ({ unit, count }) => {
    return unit === xInterval.unit && count === xInterval.count;
  });
  // if we weren't able to find something matching then we'll start from the beginning and try everything
  if (initialIndex === -1) {
    initialIndex = 0;
  }

  // Fallback value: the largest tick interval (every 100 years)
  let intervalIndex = TIMESERIES_INTERVALS.length - 1;

  // Looking for the first interval which produces less ticks than the maxTicksCount.
  // However, if it produces less than minTickCount ticks we prefer taking a smaller previous interval.
  for (let i = initialIndex; i < TIMESERIES_INTERVALS.length; i++) {
    const intervalTicksCount = expectedTickCount(
      TIMESERIES_INTERVALS[i],
      timeRangeMilliseconds,
    );

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

  return TIMESERIES_INTERVALS[intervalIndex];
}

/// return the maximum number of ticks to show for a timeseries chart of a given width
function maxTicksForChartWidth(
  chartWidth: number,
  tickFormat: (value: RowValue) => string,
) {
  const PIXELS_PER_CHARACTER = 5.5;
  // if there isn't enough buffer, the labels are hidden by ECharts
  const TICK_BUFFER_PIXELS = 10;

  // day of week and month names vary in length, but it's slow to check all of them
  // as an approximation we just use a specific date which was long in my locale
  const formattedValue = tickFormat(new Date(2019, 8, 4).toISOString());
  const pixelsPerTick =
    formattedValue.length * PIXELS_PER_CHARACTER + TICK_BUFFER_PIXELS;
  return Math.floor(chartWidth / pixelsPerTick); // round down so we don't end up with too many ticks
}

/// return the range, in milliseconds, of the xDomain. ("Range" in this sense refers to the total "width"" of the
/// chart in milliseconds.)
function timeRangeMilliseconds(xDomain: ContinuousDomain) {
  const startTime = xDomain[0]; // these are UNIX timestamps in milliseconds
  const endTime = xDomain[1];
  return endTime - startTime;
}

/// return the appropriate entry in TIMESERIES_INTERVALS for a given chart with domain, interval, and width.
/// The entry is used to calculate how often a tick should be displayed for this chart (e.g. one tick every 5 minutes)
export function computeTimeseriesTicksInterval(
  xDomain: ContinuousDomain,
  xInterval: TimeSeriesInterval,
  chartWidth: number,
  tickFormat: (value: RowValue) => string,
) {
  return timeseriesTicksInterval(
    xInterval,
    timeRangeMilliseconds(xDomain),
    maxTicksForChartWidth(chartWidth, tickFormat),
  );
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
    new Set(series.map(s => s.data.results_timezone)),
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
