/* @flow weak */

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
    "year" // https://github.com/metabase/metabase/issues/1992
]);

// investigate the response from a dataset query and determine if the dimension is a timeseries
export function dimensionIsTimeseries({ cols, rows }, i = 0) {
    return (
        (isDate(cols[i]) && (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))) ||
        moment(rows[0] && rows[0][i], moment.ISO_8601).isValid()
    );
}

// mostly matches
// https://github.com/mbostock/d3/wiki/Time-Scales
// https://github.com/mbostock/d3/wiki/Time-Intervals
// Use UTC methods to avoid issues with daylight savings
// NOTE: smaller modulos within an interval type must be multiples of larger ones (e.x. can't do both 2 days and 7 days i.e. week)
const TIMESERIES_INTERVALS = [
    { interval: "ms",     count: 1,   testFn: (d) => 0                            }, //  (0) millisecond
    { interval: "second", count: 1,   testFn: (d) => parseTimestamp(d).milliseconds() }, //  (1) 1 second
    { interval: "second", count: 5,   testFn: (d) => parseTimestamp(d).seconds() % 5  }, //  (2) 5 seconds
    { interval: "second", count: 15,  testFn: (d) => parseTimestamp(d).seconds() % 15 }, //  (3) 15 seconds
    { interval: "second", count: 30,  testFn: (d) => parseTimestamp(d).seconds() % 30 }, //  (4) 30 seconds
    { interval: "minute", count: 1,   testFn: (d) => parseTimestamp(d).seconds()      }, //  (5) 1 minute
    { interval: "minute", count: 5,   testFn: (d) => parseTimestamp(d).minutes() % 5  }, //  (6) 5 minutes
    { interval: "minute", count: 15,  testFn: (d) => parseTimestamp(d).minutes() % 15 }, //  (7) 15 minutes
    { interval: "minute", count: 30,  testFn: (d) => parseTimestamp(d).minutes() % 30 }, //  (8) 30 minutes
    { interval: "hour",   count: 1,   testFn: (d) => parseTimestamp(d).minutes()      }, //  (9) 1 hour
    { interval: "hour",   count: 3,   testFn: (d) => parseTimestamp(d).hours() % 3    }, // (10) 3 hours
    { interval: "hour",   count: 6,   testFn: (d) => parseTimestamp(d).hours() % 6    }, // (11) 6 hours
    { interval: "hour",   count: 12,  testFn: (d) => parseTimestamp(d).hours() % 12   }, // (12) 12 hours
    { interval: "day",    count: 1,   testFn: (d) => parseTimestamp(d).hours()        }, // (13) 1 day
    { interval: "week",   count: 1,   testFn: (d) => parseTimestamp(d).date() % 7     }, // (14) 7 days / 1 week
    { interval: "month",  count: 1,   testFn: (d) => parseTimestamp(d).date()         }, // (15) 1 months
    { interval: "month",  count: 3,   testFn: (d) => parseTimestamp(d).month() % 3    }, // (16) 3 months / 1 quarter
    { interval: "year",   count: 1,   testFn: (d) => parseTimestamp(d).month()        }, // (17) 1 year
    { interval: "year",   count: 5,   testFn: (d) => parseTimestamp(d).year() % 5     }, // (18) 5 year
    { interval: "year",   count: 10,  testFn: (d) => parseTimestamp(d).year() % 10    }, // (19) 10 year
    { interval: "year",   count: 50,  testFn: (d) => parseTimestamp(d).year() % 50    }, // (20) 50 year
    { interval: "year",   count: 100, testFn: (d) => parseTimestamp(d).year() % 100   }  // (21) 100 year
];

// mapping from Metabase "unit" to d3 intervals above
const INTERVAL_INDEX_BY_UNIT = {
    "minute": 1,
    "hour": 9,
    "day": 13,
    "week": 14,
    "month": 15,
    "quarter": 16,
    "year": 17
};

export function minTimeseriesUnit(units) {
    return units.reduce((minUnit, unit) =>
        unit != null && (minUnit == null || INTERVAL_INDEX_BY_UNIT[unit] < INTERVAL_INDEX_BY_UNIT[minUnit]) ? unit : minUnit
    , null);
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
            let interval = TIMESERIES_INTERVALS[i];
            let value = interval.testFn(xValue);
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
    return TIMESERIES_INTERVALS[computeTimeseriesDataInvervalIndex(xValues, unit)];
}

export function computeTimeseriesTicksInterval(xDomain, xInterval, chartWidth, minPixels) {
    // If the interval that matches the data granularity results in too many ticks reduce the granularity until it doesn't.
    // TODO: compute this directly instead of iteratively
    let maxTickCount = Math.round(chartWidth / minPixels);
    let index = _.findIndex(TIMESERIES_INTERVALS, ({ interval, count }) => interval === xInterval.interval && count === xInterval.count);
    while (index < TIMESERIES_INTERVALS.length - 1) {
        let interval = TIMESERIES_INTERVALS[index];
        let intervalMs = moment(0).add(interval.count, interval.interval).valueOf();
        let tickCount = (xDomain[1] - xDomain[0]) / intervalMs;
        if (tickCount <= maxTickCount) {
            break;
        }
        index++;
    }
    return TIMESERIES_INTERVALS[index];
}
