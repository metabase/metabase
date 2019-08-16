import d3 from "d3";
import {
  dimensionIsTimeseries,
  computeTimeseriesDataInverval,
  rangeFnForOffsetCreator,
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

  describe("rangeFnForOffsetCreator", () => {
    [
      [-12, "-12:00"],
      [-1, "-01:00"],
      [0, "Z"],
      [1, "+01:00"],
      [12, "+12:00"],
    ].forEach(([offsetInt, offsetString]) => {
      it(`should create an hourly range in ${offsetString}`, () => {
        const getRangeFnForOffset = rangeFnForOffsetCreator(d3.time.hours);
        const rangeFn = getRangeFnForOffset(offsetInt);
        const start = new Date("2019-01-01T00:00:00.000" + offsetString);
        const stop = new Date("2019-01-02T00:00:00.000" + offsetString);

        const ticks = rangeFn(start, stop, 1).map(d => d.format());

        expect(ticks.length).toBe(24);
        expect(ticks[0]).toBe("2019-01-01T00:00:00" + offsetString);
        expect(ticks[ticks.length - 1]).toBe(
          "2019-01-01T23:00:00" + offsetString,
        );
      });

      it(`should create a daily range in ${offsetString}`, () => {
        const getRangeFnForOffset = rangeFnForOffsetCreator(d3.time.days);
        const rangeFn = getRangeFnForOffset(offsetInt);
        const start = new Date("2019-01-01T00:00:00.000" + offsetString);
        const stop = new Date("2019-01-10T00:00:00.000" + offsetString);

        const ticks = rangeFn(start, stop, 1).map(d => d.format());

        expect(ticks.length).toBe(9);
        expect(ticks[0]).toBe("2019-01-01T00:00:00" + offsetString);
        expect(ticks[ticks.length - 1]).toBe(
          "2019-01-09T00:00:00" + offsetString,
        );
      });
    });
  });
});
