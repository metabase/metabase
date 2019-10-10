import moment from "moment";

import {
  dimensionIsTimeseries,
  computeTimeseriesDataInverval,
  timeseriesScale,
} from "metabase/visualizations/lib/timeseries";

import { TYPE } from "metabase/lib/types";

describe("visualization.lib.timeseries", () => {
  describe("dimensionIsTimeseries", () => {
    // examples from https://en.wikipedia.org/wiki/ISO_8601
    const ISO_8601_DATES = [
      "2016-02-12",
      "2016-02-12T03:21:55+00:00",
      "2016-02-12T03:21:55Z",
      "20160212T032155Z",
      "2016-W06",
      "2016-W06-5",
      "2016-043",
    ];

    const NOT_DATES = ["100", "100 %", "scanner 005"];

    it("should detect Date column as timeseries", () => {
      expect(dimensionIsTimeseries({ cols: [{ base_type: TYPE.Date }] })).toBe(
        true,
      );
    });
    it("should detect Time column as timeseries", () => {
      expect(dimensionIsTimeseries({ cols: [{ base_type: TYPE.Time }] })).toBe(
        true,
      );
    });
    it("should detect DateTime column as timeseries", () => {
      expect(
        dimensionIsTimeseries({ cols: [{ base_type: TYPE.DateTime }] }),
      ).toBe(true);
    });
    ISO_8601_DATES.forEach(isoDate => {
      it(
        "should detect values with ISO 8601 formatted string '" +
          isoDate +
          "' as timeseries",
        () => {
          expect(
            dimensionIsTimeseries({
              cols: [{ base_type: TYPE.Text }],
              rows: [[isoDate]],
            }),
          ).toBe(true);
        },
      );
    });
    NOT_DATES.forEach(notDate => {
      it("should not detect value '" + notDate + "' as timeseries", () => {
        expect(
          dimensionIsTimeseries({
            cols: [{ base_type: TYPE.Text }],
            rows: [[notDate]],
          }),
        ).toBe(false);
      });
    });
  });

  describe("computeTimeseriesDataInvervalIndex", () => {
    const TEST_CASES = [
      ["ms", 1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:01.001Z"]]],
      [
        "second",
        1,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:01.000Z"]],
      ],
      [
        "second",
        5,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:05.000Z"]],
      ],
      [
        "second",
        15,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:15.000Z"]],
      ],
      [
        "second",
        30,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:30.000Z"]],
      ],
      [
        "minute",
        1,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:02:00.000Z"]],
      ],
      [
        "minute",
        5,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:05:00.000Z"]],
      ],
      [
        "minute",
        15,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:15:00.000Z"]],
      ],
      [
        "minute",
        30,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:30:00.000Z"]],
      ],
      ["hour", 1, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T01:00:00.000Z"]]],
      ["hour", 3, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T03:00:00.000Z"]]],
      ["hour", 6, [["2015-01-01T00:00:00.000Z"], ["2016-05-04T06:00:00.000Z"]]],
      [
        "hour",
        12,
        [["2015-01-01T00:00:00.000Z"], ["2016-05-04T12:00:00.000Z"]],
      ],
      ["day", 1, [["2015-01-01T00:00:00.000Z"], ["2015-01-02T00:00:00.000Z"]]],
      ["week", 1, [["2015-01-01T00:00:00.000Z"], ["2015-01-08T00:00:00.000Z"]]],
      [
        "month",
        1,
        [["2015-01-01T00:00:00.000Z"], ["2015-02-01T00:00:00.000Z"]],
      ],
      [
        "month",
        3,
        [["2015-01-01T00:00:00.000Z"], ["2015-04-01T00:00:00.000Z"]],
      ],
      ["year", 1, [["2015-01-01T00:00:00.000Z"], ["2016-01-01T00:00:00.000Z"]]],
      ["year", 5, [["2015-01-01T00:00:00.000Z"], ["2020-01-01T00:00:00.000Z"]]],
      [
        "year",
        10,
        [["2015-01-01T00:00:00.000Z"], ["2025-01-01T00:00:00.000Z"]],
      ],
      ["day", 1, [["2019-01-01T00:00:00.000Z"]]],
    ];

    TEST_CASES.map(([expectedInterval, expectedCount, data]) => {
      it("should return " + expectedCount + " " + expectedInterval, () => {
        const { interval, count } = computeTimeseriesDataInverval(
          data.map(d => new Date(d)),
        );
        expect(interval).toBe(expectedInterval);
        expect(count).toBe(expectedCount);
      });
    });
  });

  describe("timeseriesScale", () => {
    it("should create day ranges", () => {
      const scale = timeseriesScale(
        { interval: "day", count: 1 },
        "Etc/UTC",
      ).domain([
        moment("2019-03-08T00:00:00.000Z"),
        moment("2019-03-12T00:00:00.000Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-03-08T00:00:00.000Z",
        "2019-03-09T00:00:00.000Z",
        "2019-03-10T00:00:00.000Z",
        "2019-03-11T00:00:00.000Z",
        "2019-03-12T00:00:00.000Z",
      ]);
    });

    it("should create day ranges in pacific time across dst boundary", () => {
      const scale = timeseriesScale(
        { interval: "day", count: 1 },
        "US/Pacific",
      ).domain([
        moment("2019-03-08T00:00:00.000-08"),
        moment("2019-03-12T00:00:00.000-07"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-03-08T08:00:00.000Z",
        "2019-03-09T08:00:00.000Z",
        "2019-03-10T08:00:00.000Z",
        "2019-03-11T07:00:00.000Z",
        "2019-03-12T07:00:00.000Z",
      ]);
    });

    it("should create day ranges when the domain doesn't line up with unit boundaries", () => {
      const scale = timeseriesScale(
        { interval: "day", count: 1 },
        "Etc/UTC",
      ).domain([
        moment("2019-03-07T12:34:56.789Z"),
        moment("2019-03-12T12:34:56.789Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-03-08T00:00:00.000Z",
        "2019-03-09T00:00:00.000Z",
        "2019-03-10T00:00:00.000Z",
        "2019-03-11T00:00:00.000Z",
        "2019-03-12T00:00:00.000Z",
      ]);
    });

    it("should create month ranges in timezone", () => {
      const scale = timeseriesScale(
        { interval: "month", count: 1 },
        "Asia/Hong_kong",
      ).domain([
        moment("2019-03-07T12:34:56.789Z"),
        moment("2019-04-12T12:34:56.789Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-03-31T16:00:00.000Z",
      ]);
    });

    it("should create month ranges spaced by count", () => {
      const scale = timeseriesScale(
        { interval: "month", count: 3 },
        "Etc/UTC",
      ).domain([
        moment("2018-11-01T00:00:00.000Z"),
        moment("2020-02-01T00:00:00.000Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-01-01T00:00:00.000Z",
        "2019-04-01T00:00:00.000Z",
        "2019-07-01T00:00:00.000Z",
        "2019-10-01T00:00:00.000Z",
        "2020-01-01T00:00:00.000Z",
      ]);
    });

    it("should create 50 year ranges", () => {
      const scale = timeseriesScale(
        { interval: "year", count: 50 },
        "Etc/UTC",
      ).domain([
        moment("1890-01-01T00:00:00.000Z"),
        moment("2020-01-01T00:00:00.000Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "1900-01-01T00:00:00.000Z",
        "1950-01-01T00:00:00.000Z",
        "2000-01-01T00:00:00.000Z",
      ]);
    });
  });
});
