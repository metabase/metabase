import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import testAcrossTimezones from "__support__/timezones";
import { computeTimeseriesDataInverval } from "metabase/visualizations/echarts/cartesian/utils/timeseries";

testAcrossTimezones(reportTz => {
  computeTimeseriesDataInverval;
  describe("computeTimeseriesDataInvervalIndex", () => {
    [
      ["hour", 6, ["2015-01-01T00:00:00", "2016-05-04T06:00:00"]],
      ["hour", 12, ["2015-01-01T00:00:00", "2016-05-04T12:00:00"]],
      ["day", 1, ["2019-03-01T00:00:00", "2019-03-16T00:00:00"]],
      ["week", 1, ["2019-03-01T00:00:00", "2019-03-15T00:00:00"]],
      ["month", 1, ["2015-03-01T00:00:00", "2019-02-01T00:00:00"]],
      ["month", 3, ["2019-01-01T00:00:00", "2019-04-01T00:00:00"]],
    ].map(([expectedUnit, expectedCount, data]) => {
      it(`should return ${expectedCount} ${expectedUnit}`, () => {
        // parse timestamps in reporting timezone and serialize
        const xValues = data.map(d => moment.tz(d, reportTz).format());

        const { unit, count } = computeTimeseriesDataInverval(xValues);

        expect(unit).toBe(expectedUnit);
        expect(count).toBe(expectedCount);
      });
    });
  });
});
