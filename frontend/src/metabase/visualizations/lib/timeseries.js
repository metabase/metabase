/* @flow weak */

import d3 from "d3";
import moment from "moment";
import _ from "underscore";

import { isDate } from "metabase/lib/schema_metadata";
import { parseTimestamp } from "metabase/lib/time";

const TIMESERIES_UNITS = new Set([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year", // https://github.com/metabase/metabase/issues/1992
]);

// investigate the response from a dataset query and determine if the dimension is a timeseries
export function dimensionIsTimeseries({ cols, rows }, i = 0) {
  return (
    (isDate(cols[i]) &&
      (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))) ||
    moment(rows[0] && rows[0][i], moment.ISO_8601).isValid()
  );
}

// mostly matches
// https://github.com/mbostock/d3/wiki/Time-Scales
// https://github.com/mbostock/d3/wiki/Time-Intervals
// Use UTC methods to avoid issues with daylight savings
// NOTE: smaller modulos within an interval type must be multiples of larger ones (e.x. can't do both 2 days and 7 days i.e. week)
//
// Count and time interval for axis.ticks() (see https://github.com/d3/d3-3.x-api-reference/blob/master/SVG-Axes.md#ticks)
// is specified by rangeFn and count, e.g.
//
// xAxis.ticks(interval.rangeFn, interval.count) -> xAxis.ticks(d3.time.minutes, 15) // every 15 minutes
//
// TODO - I'm not sure what the appropriate thing to put for rangeFn for milliseconds is. This matches the previous
// behavior, which may have been wrong in the first place. See https://github.com/d3/d3/issues/1529 for a similar issue
const TIMESERIES_INTERVALS = [
  { interval: "ms", count: 1, rangeFn: undefined, testFn: d => 0 }, //  (0) millisecond
  {
    interval: "second",
    count: 1,
    rangeFn: d3.time.seconds,
    testFn: d => parseTimestamp(d).milliseconds(),
  }, //  (1) 1 second
  {
    interval: "second",
    count: 5,
    rangeFn: d3.time.seconds,
    testFn: d => parseTimestamp(d).seconds() % 5,
  }, //  (2) 5 seconds
  {
    interval: "second",
    count: 15,
    rangeFn: d3.time.seconds,
    testFn: d => parseTimestamp(d).seconds() % 15,
  }, //  (3) 15 seconds
  {
    interval: "second",
    count: 30,
    rangeFn: d3.time.seconds,
    testFn: d => parseTimestamp(d).seconds() % 30,
  }, //  (4) 30 seconds
  {
    interval: "minute",
    count: 1,
    rangeFn: d3.time.minutes,
    testFn: d => parseTimestamp(d).seconds(),
  }, //  (5) 1 minute
  {
    interval: "minute",
    count: 5,
    rangeFn: d3.time.minutes,
    testFn: d => parseTimestamp(d).minutes() % 5,
  }, //  (6) 5 minutes
  {
    interval: "minute",
    count: 15,
    rangeFn: d3.time.minutes,
    testFn: d => parseTimestamp(d).minutes() % 15,
  }, //  (7) 15 minutes
  {
    interval: "minute",
    count: 30,
    rangeFn: d3.time.minutes,
    testFn: d => parseTimestamp(d).minutes() % 30,
  }, //  (8) 30 minutes
  {
    interval: "hour",
    count: 1,
    rangeFn: d3.time.hours,
    testFn: d => parseTimestamp(d).minutes(),
  }, //  (9) 1 hour
  {
    interval: "hour",
    count: 3,
    rangeFn: d3.time.hours,
    testFn: d => parseTimestamp(d).hours() % 3,
  }, // (10) 3 hours
  {
    interval: "hour",
    count: 6,
    rangeFn: d3.time.hours,
    testFn: d => parseTimestamp(d).hours() % 6,
  }, // (11) 6 hours
  {
    interval: "hour",
    count: 12,
    rangeFn: d3.time.hours,
    testFn: d => parseTimestamp(d).hours() % 12,
  }, // (12) 12 hours
  {
    interval: "day",
    count: 1,
    rangeFn: d3.time.days,
    testFn: d => parseTimestamp(d).hours(),
  }, // (13) 1 day
  {
    interval: "week",
    count: 1,
    rangeFn: d3.time.weeks,
    testFn: d => parseTimestamp(d).date() % 7,
  }, // (14) 7 days / 1 week
  {
    interval: "month",
    count: 1,
    rangeFn: d3.time.months,
    testFn: d => parseTimestamp(d).date(),
  }, // (15) 1 months
  {
    interval: "month",
    count: 3,
    rangeFn: d3.time.months,
    testFn: d => parseTimestamp(d).month() % 3,
  }, // (16) 3 months / 1 quarter
  {
    interval: "year",
    count: 1,
    rangeFn: d3.time.years,
    testFn: d => parseTimestamp(d).month(),
  }, // (17) 1 year
  {
    interval: "year",
    count: 5,
    rangeFn: d3.time.years,
    testFn: d => parseTimestamp(d).year() % 5,
  }, // (18) 5 year
  {
    interval: "year",
    count: 10,
    rangeFn: d3.time.years,
    testFn: d => parseTimestamp(d).year() % 10,
  }, // (19) 10 year
  {
    interval: "year",
    count: 50,
    rangeFn: d3.time.years,
    testFn: d => parseTimestamp(d).year() % 50,
  }, // (20) 50 year
  {
    interval: "year",
    count: 100,
    rangeFn: d3.time.years,
    testFn: d => parseTimestamp(d).year() % 100,
  }, // (21) 100 year
];

// mapping from Metabase "unit" to d3 intervals above
const INTERVAL_INDEX_BY_UNIT = {
  minute: 1,
  hour: 9,
  day: 13,
  week: 14,
  month: 15,
  quarter: 16,
  year: 17,
};

export function minTimeseriesUnit(units) {
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

function computeTimeseriesDataInvervalIndex(xValues, unit) {
  if (unit && INTERVAL_INDEX_BY_UNIT[unit] != undefined) {
    return INTERVAL_INDEX_BY_UNIT[unit];
  }
  // Keep track of the value seen for each level of granularity,
  // if any don't match then we know the data is *at least* that granular.
  let values = [];
  let index = TIMESERIES_INTERVALS.length;
  for (let xValue of xValues) {
    // Only need to check more granular than the current interval
    for (let i = 0; i < TIMESERIES_INTERVALS.length && i < index; i++) {
      const interval = TIMESERIES_INTERVALS[i];
      const value = interval.testFn(xValue);
      if (values[i] === undefined) {
        values[i] = value;
      } else if (values[i] !== value) {
        index = i;
      }
    }
  }
  return index - 1;
}

export function computeTimeseriesDataInverval(xValues, unit) {
  return TIMESERIES_INTERVALS[
    computeTimeseriesDataInvervalIndex(xValues, unit)
  ];
}

// ------------------------- Computing the TIMESERIES_INTERVALS entry to use for a chart ------------------------- //

/// The number of milliseconds between each tick for an entry in TIMESERIES_INTERVALS.
/// For example a "5 seconds" interval would have a tick "distance" of 5000 milliseconds.
function intervalTickDistanceMilliseconds(interval) {
  // add COUNT nuumber of INTERVALS to the UNIX timestamp 0. e.g. add '5 hours' to 0. Then get the new timestamp
  // (in milliseconds). Since we added to 0 this will be the interval between each tick
  return moment(0)
    .add(interval.count, interval.interval)
    .valueOf();
}

/// Return the number of ticks we can expect to see over a time range using the TIMESERIES_INTERVALS entry interval.
/// for example a "5 seconds" interval over a time range of a minute should have an expected tick count of 20.
function expectedTickCount(interval, timeRangeMilliseconds) {
  return Math.ceil(
    timeRangeMilliseconds / intervalTickDistanceMilliseconds(interval),
  );
}

/// Get the appropriate tick interval option option from the TIMESERIES_INTERVALS above based on the xAxis bucketing
/// and the max number of ticks we want to show (itself calculated from chart width).
function timeseriesTicksInterval(
  xInterval,
  timeRangeMilliseconds,
  maxTickCount,
) {
  // first we want to find out where in TIMESERIES_INTERVALS we should start looking for a good match. Find the
  // interval with a matching interval and count (e.g. `hour` and `1`) and we'll start there.
  let initialIndex = _.findIndex(
    TIMESERIES_INTERVALS,
    ({ interval, count }) => {
      return interval === xInterval.interval && count === xInterval.count;
    },
  );
  // if we weren't able to find soemthing matching then we'll start from the beginning and try everything
  if (initialIndex === -1) {
    initialIndex = 0;
  }

  // now starting at the TIMESERIES_INTERVALS entry in question, calculate the expected tick count for that interval
  // based on the time range we are displaying. If the expected tick count is less than or equal to the target
  // maxTickCount, we can go ahead and use this interval. Otherwise continue on to the next larger interval, for
  // example every 3 hours instead of every one hour. Continue until we find something with an interval large enough
  // to keep the total tick count under the max tick count
  for (const interval of _.rest(TIMESERIES_INTERVALS, initialIndex)) {
    if (expectedTickCount(interval, timeRangeMilliseconds) <= maxTickCount) {
      return interval;
    }
  }

  // If we still failed to find an interval that will produce less ticks than the max then fall back to the largest
  // tick interval (every 100 years)
  return TIMESERIES_INTERVALS[TIMESERIES_INTERVALS.length - 1];
}

/// return the maximum number of ticks to show for a timeseries chart of a given width. Unlike other chart types, this
/// isn't smart enough to actually estimate how much space each tick will take. Instead the estimated with is
/// hardcoded below.
/// TODO - it would be nice to rework this a bit so we
function maxTicksForChartWidth(chartWidth) {
  const MIN_PIXELS_PER_TICK = 160;
  return Math.floor(chartWidth / MIN_PIXELS_PER_TICK); // round down so we don't end up with too many ticks
}

/// return the range, in milliseconds, of the xDomain. ("Range" in this sense refers to the total "width"" of the
/// chart in millisecodns.)
function timeRangeMilliseconds(xDomain) {
  const startTime = xDomain[0]; // these are UNIX timestamps in milliseconds
  const endTime = xDomain[1];
  return endTime - startTime;
}

/// return the appropriate entry in TIMESERIES_INTERVALS for a given chart with domain, interval, and width.
/// The entry is used to calculate how often a tick should be displayed for this chart (e.g. one tick every 5 minutes)
export function computeTimeseriesTicksInterval(xDomain, xInterval, chartWidth) {
  return timeseriesTicksInterval(
    xInterval,
    timeRangeMilliseconds(xDomain),
    maxTicksForChartWidth(chartWidth),
  );
}
