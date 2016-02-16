import d3 from "d3";
import moment from "moment";

// agument d3 with a simple quarters range implementation
d3.time.quarters = (start, stop, step) => d3.time.months(start, stop, 3);

// mostly matches https://github.com/mbostock/d3/wiki/Time-Scales
// Use UTC methods to avoid issues with daylight savings
// NOTE: smaller modulos within an interval type must be multiples of larger ones (e.x. can't do both 2 days and 7 days i.e. week)
export const TIMESERIES_INTERVALS = [
    { interval: "ms",     count: 1,   testFn: (d) => 0                            }, // millisecond
    { interval: "second", count: 1,   testFn: (d) => moment.utc(d).milliseconds() }, // 1 second
    { interval: "second", count: 5,   testFn: (d) => moment.utc(d).seconds() % 5  }, // 5 seconds
    { interval: "second", count: 15,  testFn: (d) => moment.utc(d).seconds() % 15 }, // 15 seconds
    { interval: "second", count: 30,  testFn: (d) => moment.utc(d).seconds() % 30 }, // 30 seconds
    { interval: "minute", count: 1,   testFn: (d) => moment.utc(d).seconds()      }, // 1 minute
    { interval: "minute", count: 5,   testFn: (d) => moment.utc(d).minutes() % 5  }, // 5 minutes
    { interval: "minute", count: 15,  testFn: (d) => moment.utc(d).minutes() % 15 }, // 15 minutes
    { interval: "minute", count: 30,  testFn: (d) => moment.utc(d).minutes() % 30 }, // 30 minutes
    { interval: "hour",   count: 1,   testFn: (d) => moment.utc(d).minutes()      }, // 1 hour
    { interval: "hour",   count: 3,   testFn: (d) => moment.utc(d).hours() % 3    }, // 3 hours
    { interval: "hour",   count: 6,   testFn: (d) => moment.utc(d).hours() % 6    }, // 6 hours
    { interval: "hour",   count: 12,  testFn: (d) => moment.utc(d).hours() % 12   }, // 12 hours
    { interval: "day",    count: 1,   testFn: (d) => moment.utc(d).hours()        }, // 1 day
    { interval: "week",   count: 1,   testFn: (d) => moment.utc(d).date() % 7     }, // 7 days / 1 week
    { interval: "month",  count: 1,   testFn: (d) => moment.utc(d).date()         }, // 1 months
    { interval: "month",  count: 3,   testFn: (d) => moment.utc(d).month() % 3    }, // 3 months / 1 quarter
    { interval: "year",   count: 1,   testFn: (d) => moment.utc(d).month()        }, // 1 year
    { interval: "year",   count: 5,   testFn: (d) => moment.utc(d).year() % 5     }, // 5 year
    { interval: "year",   count: 10,  testFn: (d) => moment.utc(d).year() % 10    }, // 10 year
    { interval: "year",   count: 50,  testFn: (d) => moment.utc(d).year() % 50    }, // 50 year
    { interval: "year",   count: 100, testFn: (d) => moment.utc(d).year() % 100   }  // 100 year
];

const TIMESERIES_INTERVAL_INDEX_BY_UNIT = {
    "minute": 1,
    "hour": 9,
    "day": 13,
    "week": 15,
    "month": 16,
    "quarter": 17,
    "year": 18,
};

export function computeTimeseriesDataInvervalIndex(xValues) {
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

export function computeTimeseriesTicksInterval(xValues, col, chartWidth, minPixels) {
    // If the interval that matches the data granularity results in too many ticks reduce the granularity until it doesn't.
    // TODO: compute this directly instead of iteratively
    let maxTickCount = Math.round(chartWidth / minPixels);
    let xDomain = d3.extent(xValues);
    let index = col && col.unit ? TIMESERIES_INTERVAL_INDEX_BY_UNIT[col.unit] : null;
    if (typeof index !== "number") {
        index = computeTimeseriesDataInvervalIndex(xValues);
    }
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
