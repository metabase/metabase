import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Enable timezone and UTC plugins
dayjs.extend(utc);
dayjs.extend(timezone);

import { NumberColumn, StringColumn } from "__support__/visualizations";
import { getVisualizationTransformed } from "metabase/visualizations";
import {
  computeTimeseriesDataInterval,
  computeTimeseriesTicksInterval,
  getTimezoneOrOffset,
  normalizeDate,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

describe("visualization.lib.timeseries", () => {
  describe("computeTimeseriesDataIntervalIndex", () => {
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
      ["week", 1, [["2015-01-31T00:00:00.000Z"], ["2015-02-07T00:00:00.000Z"]]], // (metabase#14605)
      [
        "month",
        1,
        [["2015-01-01T00:00:00.000Z"], ["2015-02-01T00:00:00.000Z"]],
      ],
      [
        "quarter",
        1,
        [["2015-01-01T00:00:00.000Z"], ["2015-04-01T00:00:00.000Z"]],
      ],
      ["year", 1, [["2015-01-01T00:00:00.000Z"], ["2016-01-01T00:00:00.000Z"]]],
      [
        "year",
        10,
        [["2015-01-01T00:00:00.000Z"], ["2025-01-01T00:00:00.000Z"]],
      ],
      [
        "year",
        100,
        [["2015-01-01T00:00:00.000Z"], ["2115-01-01T00:00:00.000Z"]],
      ],
      ["day", 1, [["2019-01-01T00:00:00.000Z"]]],
    ];

    TEST_CASES.map(([expectedUnit, expectedCount, data]) => {
      it(`should return ${expectedCount} ${expectedUnit}`, () => {
        const { unit, count } = computeTimeseriesDataInterval(
          data.map((d) => new Date(d)),
        );
        expect(unit).toBe(expectedUnit);
        expect(count).toBe(expectedCount);
      });
    });

    const units = ["minute", "hour", "day", "week", "month", "year"];

    units.forEach((testUnit) => {
      it(`should return one ${testUnit} when ${testUnit} interval is set`, () => {
        const { unit, count } = computeTimeseriesDataInterval(
          [
            new Date("2019-01-01").toISOString(),
            new Date("2020-01-01").toISOString(),
          ],
          testUnit,
        );
        expect(unit).toBe(testUnit);
        expect(count).toBe(1);
      });
    });

    it("should return 1 quarter for quarter interval", () => {
      const { unit, count } = computeTimeseriesDataInterval(
        [
          new Date("2019-01-01").toISOString(),
          new Date("2020-01-01").toISOString(),
        ],
        "quarter",
      );
      expect(unit).toBe("quarter");
      expect(count).toBe(1);
    });

    it("should should ignore null X values", () => {
      const { unit, count } = computeTimeseriesDataInterval([
        null,
        new Date("2020-01-01").toISOString(),
        null,
        new Date("2020-03-01").toISOString(),
        null,
      ]);
      expect(unit).toBe("month");
      expect(count).toBe(1);
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
        { expectedUnit: "month", expectedCount: 1 },
      ],
      // it should be bump to quarters on a narrower chart
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 700,
          tickFormat: fakeTickFormat,
        },
        { expectedUnit: "quarter", expectedCount: 1 },
      ],
      // even narrower and we should show yearly ticks
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 300,
          tickFormat: fakeTickFormat,
        },
        { expectedUnit: "year", expectedCount: 1 },
      ],
      // FIXME: investigate and uncomment
      // shouldn't move to a more granular interval than what was passed
      // [
      //   {
      //     xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
      //     xInterval: { interval: "month", count: 3 },
      //     chartWidth: 1920,
      //     tickFormat: fakeTickFormat,
      //   },
      //   { expectedUnit: "month", expectedCount: 3 },
      // ],
      // Long date formats should update the interval to have fewer ticks
      [
        {
          xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
          xInterval: { interval: "month", count: 1 },
          chartWidth: 1920,
          tickFormat: () =>
            // thankfully no date format is actually this long
            "The eighth day of July in the year of our Lord two thousand and nineteen",
        },
        { expectedUnit: "year", expectedCount: 1 },
      ],
    ];

    TEST_CASES.map(
      ([
        { xDomain, xInterval, chartWidth, tickFormat },
        { expectedUnit, expectedCount },
      ]) => {
        it(`should return ${expectedCount} ${expectedUnit}`, () => {
          const { unit, count } = computeTimeseriesTicksInterval(
            xDomain,
            xInterval,
            chartWidth,
            tickFormat,
          );
          expect(unit).toBe(expectedUnit);
          expect(count).toBe(expectedCount);
        });
      },
    );
  });

  describe("getTimezoneOrOffset", () => {
    const showWarningMock = jest.fn();

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

    beforeEach(() => {
      showWarningMock.mockClear();
    });

    it("should extract results_timezone", () => {
      const { timezone } = getTimezoneOrOffset(series);
      expect(timezone).toBe("US/Eastern");
    });

    it("should extract results_timezone after series is transformed", () => {
      const { series: transformed } = getVisualizationTransformed(series);
      const { timezone } = getTimezoneOrOffset(transformed);
      expect(timezone).toBe("US/Eastern");
    });

    it("should return the correct timezone when there is only one timezone", () => {
      const series = [
        {
          data: {
            results_timezone: "America/New_York",
            requested_timezone: "America/New_York",
          },
        },
      ];
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({
        timezone: "America/New_York",
        offsetMinutes: undefined,
      });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should return the default timezone when results_timezone is undefined", () => {
      const series = [
        {
          data: {
            results_timezone: undefined,
            requested_timezone: undefined,
          },
        },
      ];
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({
        timezone: "Etc/UTC",
        offsetMinutes: undefined,
      });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should return offsetMinutes when results_timezone is in offset format", () => {
      const series = [
        { data: { results_timezone: "+05:30", requested_timezone: "+05:30" } },
      ];
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({ timezone: undefined, offsetMinutes: 330 });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should show warning when there are multiple timezones in the series", () => {
      const series = [
        { data: { results_timezone: "America/New_York" } },
        { data: { results_timezone: "Europe/London" } },
      ];
      getTimezoneOrOffset(series, showWarningMock);
      expect(showWarningMock).toHaveBeenCalledTimes(1);
    });

    it("should show warning when requested_timezone is different from results_timezone", () => {
      const series = [
        {
          data: {
            results_timezone: "America/New_York",
            requested_timezone: "Europe/London",
          },
        },
      ];
      getTimezoneOrOffset(series, showWarningMock);
      expect(showWarningMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("normalizeDate", () => {
    it("should normalize date to UTC at start of day", () => {
      const date = dayjs("2023-05-15T14:30:45");
      const normalized = normalizeDate(date);
      expect(normalized.format()).toBe("2023-05-15T00:00:00Z");
    });

    it("should handle date before and after DST transition", () => {
      // Before DST: 1 AM EST
      const beforeDST = dayjs.tz("2023-03-12 01:00:00", "America/New_York");
      const normalizedBefore = normalizeDate(beforeDST);
      expect(normalizedBefore.format()).toBe("2023-03-12T00:00:00Z");

      // After DST: 3 AM EDT (after springing forward)
      const afterDST = dayjs.tz("2023-03-12 03:00:00", "America/New_York");
      const normalizedAfter = normalizeDate(afterDST);
      expect(normalizedAfter.format()).toBe("2023-03-12T00:00:00Z");
    });
  });
});
