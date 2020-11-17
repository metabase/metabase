import {
  dimensionIsTimeseries,
  computeTimeseriesDataInverval,
  getTimezone,
  computeTimeseriesTicksInterval,
} from "metabase/visualizations/lib/timeseries";
import { getVisualizationTransformed } from "metabase/visualizations";

import { StringColumn, NumberColumn } from "../__support__/visualizations";

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

  describe("getTimezone", () => {
    const series = [
      {
        card: { visualization_settings: {}, display: "bar" },
        data: {
          results_timezone: "US/Eastern",
          cols: [StringColumn({ name: "a" }), NumberColumn({ name: "b" })],
          rows: [],
        },
      },
    ];
    it("should extract results_timezone", () => {
      const timezone = getTimezone(series);
      expect(timezone).toBe("US/Eastern");
    });
    it("should extract results_timezone after series is transformed", () => {
      const { series: transformed } = getVisualizationTransformed(series);
      const timezone = getTimezone(transformed);
      expect(timezone).toBe("US/Eastern");
    });
  });

  describe("computeTimeseriesTicksInterval", () => {
    // computeTimeseriesTicksInterval just uses tickFormat to measure the character length of the current formatting style
    const fakeTickFormat = () => "2020-01-01";
    const TEST_CASES = [
      // on a wide chart, 12 month ticks shouldn't be changed
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 1920,
          tickFormat: fakeTickFormat,
        },
        { expectedInterval: "month", expectedCount: 1 },
      ],
      // it should be bump to quarters on a narrower chart
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 800,
          tickFormat: fakeTickFormat,
        },
        { expectedInterval: "month", expectedCount: 3 },
      ],
      // even narrower and we should show yearly ticks
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 300,
          tickFormat: fakeTickFormat,
        },
        { expectedInterval: "year", expectedCount: 1 },
      ],
      // shouldn't move to a more granular interval than what was passed
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 3 },
          chartWidth: 1920,
          tickFormat: fakeTickFormat,
        },
        { expectedInterval: "month", expectedCount: 3 },
      ],
      // Long date formats should update the interval to have fewer ticks
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 1920,
          tickFormat: () =>
            // thankfully no date format is actually this long
            "The eigth day of July in the year of our Lord two thousand and ninteen",
        },
        { expectedInterval: "year", expectedCount: 1 },
      ],
    ];

    TEST_CASES.map(
      ([
        { xDomain, xInterval, chartWidth, tickFormat },
        { expectedInterval, expectedCount },
      ]) => {
        it("should return " + expectedCount + " " + expectedInterval, () => {
          const { interval, count } = computeTimeseriesTicksInterval(
            xDomain,
            xInterval,
            chartWidth,
            tickFormat,
          );
          expect(interval).toBe(expectedInterval);
          expect(count).toBe(expectedCount);
        });
      },
    );
  });
});
