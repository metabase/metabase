import moment from "moment";

import fillMissingValuesInDatas from "metabase/visualizations/lib/fill_data";

// run_timezone_tests sets "TZ" environment variable to change the timezone
const clientTz = process.env["TZ"] || "[default]";
// run_timezone_tests also sets "METABASE_TEST_TIMEZONES" to list of timezones
const reportTzs = (process.env["METABASE_TEST_TIMEZONES"] || "Etc/UTC").split(
  " ",
);

describe(`client timezone ${clientTz}`, () => {
  reportTzs.map(reportTz => {
    describe(`report timezone ${reportTz}`, () => {
      describe("fillMissingValuesInDatas", () => {
        it("should fill zeros for timeseries across DST boundary", () => {
          const time1 = moment("2019-03-01T00:00:00").tz(reportTz, true);
          const time2 = moment("2019-03-30T00:00:00").tz(reportTz, true);
          const time3 = moment("2019-03-31T00:00:00").tz(reportTz, true);
          const rows = [[time1, 1], [time2, 2], [time3, 3]];
          const [filledData] = fillMissingValuesInDatas(
            {
              series: [{}],
              settings: {
                "graph.x_axis.scale": "timeseries",
                series: () => ({ "line.missing": "zero" }),
              },
            },
            {
              xValues: [time1, time2, time3],
              xDomain: [time1, time3],
              xInterval: { interval: "day", count: 1 },
            },
            [rows],
          );

          expect(filledData.map(r => r[1])).toEqual([
            1,
            ...new Array(28).fill(0),
            2,
            3,
          ]);
        });
      });
    });
  });
});
