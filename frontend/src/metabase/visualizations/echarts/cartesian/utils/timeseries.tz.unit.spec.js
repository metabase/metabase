import dayjs from "dayjs";

import testAcrossTimezones from "__support__/timezones";
import { computeTimeseriesDataInterval } from "metabase/visualizations/echarts/cartesian/utils/timeseries";

testAcrossTimezones((reportTz) => {
  computeTimeseriesDataInterval;

  describe("computeTimeseriesDataIntervalIndex", () => {
    [
      ["hour", 6, ["2015-01-01T00:00:00", "2016-05-04T06:00:00"]],
      ["hour", 12, ["2015-01-01T00:00:00", "2016-05-04T12:00:00"]],
      ["day", 1, ["2019-03-01T00:00:00", "2019-03-16T00:00:00"]],
      ["week", 1, ["2019-03-01T00:00:00", "2019-03-15T00:00:00"]],
      ["month", 1, ["2015-03-01T00:00:00", "2019-02-01T00:00:00"]],
      ["quarter", 1, ["2019-01-01T00:00:00", "2019-04-01T00:00:00"]],
    ].map(([expectedUnit, expectedCount, data]) => {
      it(`should return ${expectedCount} ${expectedUnit}`, () => {
        // parse timestamps in reporting timezone and serialize
        const xValues = data.map((d) => dayjs.tz(d, reportTz).format());

        const { unit, count } = computeTimeseriesDataInterval(xValues);

        expect(unit).toBe(expectedUnit);
        expect(count).toBe(expectedCount);
      });
    });
  });
});
