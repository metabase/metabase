import d3 from "d3";
import moment from "moment";

// mostly matches https://github.com/mbostock/d3/wiki/Time-Scales
// Use UTC methods to avoid issues with daylight savings
const TIMESERIES_INTERVALS = [
    { interval: "ms",     count: 1,  testFn: (d) => 0                      }, // millisecond
    { interval: "second", count: 1,  testFn: (d) => d.getUTCMilliseconds() }, // 1 second
    { interval: "second", count: 5,  testFn: (d) => d.getUTCSeconds() % 5  }, // 5 seconds
    { interval: "second", count: 15, testFn: (d) => d.getUTCSeconds() % 15 }, // 15 seconds
    { interval: "second", count: 30, testFn: (d) => d.getUTCSeconds() % 30 }, // 30 seconds
    { interval: "minute", count: 1,  testFn: (d) => d.getUTCSeconds()      }, // 1 minute
    { interval: "minute", count: 5,  testFn: (d) => d.getUTCMinutes() % 5  }, // 5 minutes
    { interval: "minute", count: 15, testFn: (d) => d.getUTCMinutes() % 15 }, // 15 minutes
    { interval: "minute", count: 30, testFn: (d) => d.getUTCMinutes() % 30 }, // 30 minutes
    { interval: "hour",   count: 1,  testFn: (d) => d.getUTCMinutes()      }, // 1 hour
    { interval: "hour",   count: 3,  testFn: (d) => d.getUTCHours() % 3    }, // 3 hours
    { interval: "hour",   count: 6,  testFn: (d) => d.getUTCHours() % 6    }, // 6 hours
    { interval: "hour",   count: 12, testFn: (d) => d.getUTCHours() % 12   }, // 12 hours
    { interval: "day",    count: 1,  testFn: (d) => d.getUTCHours()        }, // 1 day
    { interval: "day",    count: 2,  testFn: (d) => d.getUTCDate() % 2     }, // 2 day
    { interval: "week",   count: 1,  testFn: (d) => 0                      }, // 1 week, TODO: fix this one
    { interval: "month",  count: 1,  testFn: (d) => d.getUTCDate()         }, // 1 months
    { interval: "month",  count: 3,  testFn: (d) => d.getUTCMonth() % 3    }, // 3 months
    { interval: "year",   count: 1,  testFn: (d) => d.getUTCMonth()        }  // 1 year
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

function computeTimeseriesDataInvervalIndex(xValues) {
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
