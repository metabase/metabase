import testAcrossTimezones from "__support__/timezones";

import moment from "moment-timezone";

import { computeTimeseriesDataInverval } from "metabase/visualizations/lib/timeseries";

// jsdom doesn't support layout methods like getBBox, so we need to mock it.
window.SVGElement.prototype.getBBox = () => ({
  x: 0,
  y: 0,
  width: 1000,
  height: 1000,
});

testAcrossTimezones(reportTz => {
  describe("computeTimeseriesDataInvervalIndex", () => {
    [
      ["hour", 6, ["2015-01-01T00:00:00", "2016-05-04T06:00:00"]],
      ["hour", 12, ["2015-01-01T00:00:00", "2016-05-04T12:00:00"]],
      ["day", 1, ["2019-03-01T00:00:00", "2019-03-16T00:00:00"]],
      ["week", 1, ["2019-03-01T00:00:00", "2019-03-15T00:00:00"]],
      ["month", 1, ["2015-03-01T00:00:00", "2019-02-01T00:00:00"]],
      ["month", 3, ["2019-01-01T00:00:00", "2019-04-01T00:00:00"]],
    ].map(([expectedInterval, expectedCount, data]) => {
      it(`should return ${expectedCount} ${expectedInterval}`, () => {
        // parse timestamps in reporting timezone and serialize
        const xValues = data.map(d => moment.tz(d, reportTz).format());

        const { interval, count } = computeTimeseriesDataInverval(xValues);

        expect(interval).toBe(expectedInterval);
        expect(count).toBe(expectedCount);
      });
    });
  });
});
