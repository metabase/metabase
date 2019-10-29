import testAcrossTimezones from "__support__/timezones";

import moment from "moment-timezone";

import fillMissingValuesInDatas from "metabase/visualizations/lib/fill_data";

testAcrossTimezones(reportTz => {
  describe("fillMissingValuesInDatas", () => {
    it("should fill zeros for timeseries across DST boundary", () => {
      const time1 = moment.tz("2019-03-01T00:00:00", reportTz);
      const time2 = moment.tz("2019-03-30T00:00:00", reportTz);
      const time3 = moment.tz("2019-03-31T00:00:00", reportTz);
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
          xInterval: { interval: "day", count: 1, timezone: reportTz },
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
