import moment from "moment";

import {
  dimensionIsTimeseries,
  computeTimeseriesDataInverval,
  timeseriesScale,
  getTimezone,
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

  describe("timeseriesScale", () => {
    it("should create day ranges", () => {
      const scale = timeseriesScale({
        interval: "day",
        count: 1,
        timezone: "Etc/UTC",
      }).domain([
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
      const scale = timeseriesScale({
        interval: "day",
        count: 1,
        timezone: "US/Pacific",
      }).domain([
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

    it("should create hour ranges in pacific time across spring dst boundary", () => {
      const scale = timeseriesScale({
        interval: "hour",
        count: 1,
        timezone: "US/Pacific",
      }).domain([
        moment("2019-03-10T00:00:00.000-08"),
        moment("2019-03-10T04:00:00.000-07"),
      ]);

      expect(scale.ticks().map(t => t.format())).toEqual([
        "2019-03-10T00:00:00-08:00",
        "2019-03-10T01:00:00-08:00",
        "2019-03-10T03:00:00-07:00",
        "2019-03-10T04:00:00-07:00",
      ]);
    });

    it("should create hour ranges in pacific time across fall dst boundary", () => {
      const scale = timeseriesScale({
        interval: "hour",
        count: 1,
        timezone: "US/Pacific",
      }).domain([
        moment("2019-11-03T00:00:00.000-07"),
        moment("2019-11-03T04:00:00.000-08"),
      ]);

      expect(scale.ticks().map(t => t.format())).toEqual([
        "2019-11-03T00:00:00-07:00",
        "2019-11-03T01:00:00-07:00",
        "2019-11-03T01:00:00-08:00",
        "2019-11-03T02:00:00-08:00",
        "2019-11-03T03:00:00-08:00",
        "2019-11-03T04:00:00-08:00",
      ]);
    });

    it("should create day ranges that don't align with UTC hours", () => {
      const scale = timeseriesScale({
        interval: "day",
        count: 1,
        timezone: "Asia/Kathmandu",
      }).domain([
        moment("2019-01-01T18:15:00.000Z"),
        moment("2019-01-03T18:15:00.000Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-01-01T18:15:00.000Z",
        "2019-01-02T18:15:00.000Z",
        "2019-01-03T18:15:00.000Z",
      ]);
    });

    it("should create day ranges when the domain doesn't line up with unit boundaries", () => {
      const scale = timeseriesScale({
        interval: "day",
        count: 1,
        timezone: "Etc/UTC",
      }).domain([
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

    it("should create empty ranges if there are no ticks in domain", () => {
      const scale = timeseriesScale({
        interval: "day",
        count: 1,
        timezone: "Etc/UTC",
      }).domain([
        moment("2019-03-09T01:00:00.000Z"),
        moment("2019-03-09T22:00:00.000Z"),
      ]);

      expect(scale.ticks().length).toBe(0);
    });

    it("should create month ranges in timezone", () => {
      const scale = timeseriesScale({
        interval: "month",
        count: 1,
        timezone: "Asia/Hong_kong",
      }).domain([
        moment("2019-03-07T12:34:56.789Z"),
        moment("2019-04-12T12:34:56.789Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "2019-03-31T16:00:00.000Z",
      ]);
    });

    it("should create month ranges spaced by count", () => {
      const scale = timeseriesScale({
        interval: "month",
        count: 3,
        timezone: "Etc/UTC",
      }).domain([
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
      const scale = timeseriesScale({
        interval: "year",
        count: 50,
        timezone: "Etc/UTC",
      }).domain([
        moment("1890-01-01T00:00:00.000Z"),
        moment("2020-01-01T00:00:00.000Z"),
      ]);

      expect(scale.ticks().map(t => t.toISOString())).toEqual([
        "1900-01-01T00:00:00.000Z",
        "1950-01-01T00:00:00.000Z",
        "2000-01-01T00:00:00.000Z",
      ]);
    });

    for (const unit of ["month", "quarter", "year"]) {
      it(`should produce results with ${unit}s`, () => {
        const ticks = timeseriesScale({
          interval: unit,
          count: 1,
          timezone: "Etc/UTC",
        })
          .domain([
            moment("1999-12-31T23:59:59Z"),
            moment("2001-01-01T00:00:01Z"),
          ])
          .ticks();

        // we're just ensuring that it produces some results and that the first
        // and last are correctly rounded regardless of unit
        expect(ticks[0].toISOString()).toEqual("2000-01-01T00:00:00.000Z");
        expect(ticks[ticks.length - 1].toISOString()).toEqual(
          "2001-01-01T00:00:00.000Z",
        );
      });
    }

    // same as above but with a smaller range so the test runs faster
    for (const unit of ["minute", "hour", "day"]) {
      it(`should produce results with ${unit}s`, () => {
        const ticks = timeseriesScale({
          interval: unit,
          count: 1,
          timezone: "Etc/UTC",
        })
          .domain([
            moment("1999-12-31T23:59:59Z"),
            moment("2000-01-02T00:00:01Z"),
          ])
          .ticks();

        expect(ticks[0].toISOString()).toEqual("2000-01-01T00:00:00.000Z");
        expect(ticks[ticks.length - 1].toISOString()).toEqual(
          "2000-01-02T00:00:00.000Z",
        );
      });
    }

    // weeks are split out because their boundaries don't align with other units
    it(`should produce results with weeks`, () => {
      const ticks = timeseriesScale({
        interval: "week",
        count: 1,
        timezone: "Etc/UTC",
      })
        .domain([
          moment("2000-01-02T12:34:56Z"),
          moment("2000-02-02T12:34:56Z"),
        ])
        .ticks();

      expect(ticks[0].toISOString()).toEqual("2000-01-09T00:00:00.000Z");
      expect(ticks[ticks.length - 1].toISOString()).toEqual(
        "2000-01-30T00:00:00.000Z",
      );
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
});
