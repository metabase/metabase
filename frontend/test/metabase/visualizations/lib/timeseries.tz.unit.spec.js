import moment from "moment-timezone";

import { computeTimeseriesDataInverval } from "metabase/visualizations/lib/timeseries";

// run_timezone_tests sets "TZ" environment variable to change the timezone
const clientTz = process.env["TZ"] || "[default]";
// run_timezone_tests also sets "METABASE_TEST_TIMEZONES" to list of timezones
const reportTzs = (process.env["METABASE_TEST_TIMEZONES"] || "Etc/UTC").split(
  " ",
);

describe(`client timezone ${clientTz}`, () => {
  reportTzs.map(reportTz => {
    describe(`report timezone ${reportTz}`, () => {
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
            // parse timestamps in reporting timezone and serialize with
            const xValues = data.map(d => moment.tz(d, reportTz).format());

            const { interval, count } = computeTimeseriesDataInverval(xValues);

            expect(interval).toBe(expectedInterval);
            expect(count).toBe(expectedCount);
          });
        });
      });
    });
  });
});
