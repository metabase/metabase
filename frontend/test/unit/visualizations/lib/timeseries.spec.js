/*eslint-env jasmine */

import { computeTimeseriesDataInvervalIndex, TIMESERIES_INTERVALS } from 'metabase/visualizations/lib/timeseries';

const TEST_CASES = [
    ["ms",      1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:01.001Z"]]],
    ["second",  1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:01.000Z"]]],
    ["second",  5, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:05.000Z"]]],
    ["second", 15, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:15.000Z"]]],
    ["second", 30, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:30.000Z"]]],
    ["minute",  1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:00.000Z"]]],
    ["minute",  5, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:05:00.000Z"]]],
    ["minute", 15, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:15:00.000Z"]]],
    ["minute", 30, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:30:00.000Z"]]],
    ["hour",    1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T01:00:00.000Z"]]],
    ["hour",    3, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:00:00.000Z"]]],
    ["hour",    6, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T06:00:00.000Z"]]],
    ["hour",   12, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T12:00:00.000Z"]]],
    ["day",     1, [["2015-01-01T00:00:00.000Z"], ["2015-01-02T00:00:00.000Z"]]],
    ["week",    1, [["2015-01-01T00:00:00.000Z"], ["2015-01-08T00:00:00.000Z"]]],
    ["month",   1, [["2015-01-01T00:00:00.000Z"], ["2015-02-01T00:00:00.000Z"]]],
    ["month",   3, [["2015-01-01T00:00:00.000Z"], ["2015-04-01T00:00:00.000Z"]]],
    ["year",    1, [["2015-01-01T00:00:00.000Z"], ["2016-01-01T00:00:00.000Z"]]],
    ["year",    5, [["2015-01-01T00:00:00.000Z"], ["2020-01-01T00:00:00.000Z"]]],
    ["year",   10, [["2015-01-01T00:00:00.000Z"], ["2025-01-01T00:00:00.000Z"]]],
];

describe('visualization.lib.timeseries', () => {
    describe('computeTimeseriesDataInvervalIndex', () => {
        TEST_CASES.map(([expectedInterval, expectedCount, data]) => {
            it("should return " + expectedCount + " " + expectedInterval, () => {
                let { interval, count } = TIMESERIES_INTERVALS[computeTimeseriesDataInvervalIndex(data.map(d => new Date(d)))];
                expect(interval).toBe(expectedInterval);
                expect(count).toBe(expectedCount);
            });
        });
    });
});
