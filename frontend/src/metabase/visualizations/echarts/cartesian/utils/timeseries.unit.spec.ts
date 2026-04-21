import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Enable timezone and UTC plugins
dayjs.extend(utc);
dayjs.extend(timezone);

import { getVisualizationTransformed } from "metabase/visualizations";
import type { ChartLayout } from "metabase/visualizations/echarts/cartesian/layout/types";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  computeTimeseriesDataInterval,
  computeTimeseriesTicksInterval,
  expectedTickCount,
  getTimezoneOrOffset,
  normalizeDate,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import registerVisualizations from "metabase/visualizations/register";
import type { ContinuousDomain } from "metabase/visualizations/shared/types/scale";
import {
  type DateTimeAbsoluteUnit,
  type RawSeries,
  type RowValue,
  dateTimeAbsoluteUnits,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

function createMockChartMeasurements(
  outerWidth: number,
  xTickWidth: number,
): ChartLayout {
  return {
    boundaryWidth: 0,
    ticksDimensions: {
      getXTickWidth: () => xTickWidth,
      yTicksWidthLeft: 0,
      yTicksWidthRight: 0,
      xTicksHeight: 0,
      firstXTickWidth: 0,
      lastXTickWidth: 0,
    },
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    bounds: { top: 0, bottom: 0, left: 0, right: 0 },
    outerHeight: 0,
    outerWidth,
    axisEnabledSetting: true,
    panelGap: 0,
  };
}

registerVisualizations();

function computeDefinedTimeseriesDataInterval(
  xValues: RowValue[],
  unit: DateTimeAbsoluteUnit | null,
): TimeSeriesInterval {
  const interval = computeTimeseriesDataInterval(xValues, unit);

  if (interval == null) {
    throw new Error("Expected interval to be defined");
  }

  return interval;
}

describe("visualization.lib.timeseries", () => {
  describe("computeTimeseriesDataIntervalIndex", () => {
    type DataIntervalTestCase = [
      expectedUnit: CartesianChartDateTimeAbsoluteUnit,
      expectedCount: number,
      data: string[],
    ];

    const TEST_CASES: DataIntervalTestCase[] = [
      ["ms", 1, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:01.001Z"]],
      ["second", 1, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:01.000Z"]],
      ["second", 5, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:05.000Z"]],
      ["second", 15, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:15.000Z"]],
      ["second", 30, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:30.000Z"]],
      ["minute", 1, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:02:00.000Z"]],
      ["minute", 5, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:05:00.000Z"]],
      ["minute", 15, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:15:00.000Z"]],
      ["minute", 30, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:30:00.000Z"]],
      ["hour", 1, ["2015-01-01T00:00:00.000Z", "2016-05-04T01:00:00.000Z"]],
      ["hour", 3, ["2015-01-01T00:00:00.000Z", "2016-05-04T03:00:00.000Z"]],
      ["hour", 6, ["2015-01-01T00:00:00.000Z", "2016-05-04T06:00:00.000Z"]],
      ["hour", 12, ["2015-01-01T00:00:00.000Z", "2016-05-04T12:00:00.000Z"]],
      ["day", 1, ["2015-01-01T00:00:00.000Z", "2015-01-02T00:00:00.000Z"]],
      ["week", 1, ["2015-01-01T00:00:00.000Z", "2015-01-08T00:00:00.000Z"]],
      ["week", 1, ["2015-01-31T00:00:00.000Z", "2015-02-07T00:00:00.000Z"]], // (metabase#14605)
      ["month", 1, ["2015-01-01T00:00:00.000Z", "2015-02-01T00:00:00.000Z"]],
      ["quarter", 1, ["2015-01-01T00:00:00.000Z", "2015-04-01T00:00:00.000Z"]],
      ["year", 1, ["2015-01-01T00:00:00.000Z", "2016-01-01T00:00:00.000Z"]],
      ["year", 10, ["2015-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"]],
      ["year", 100, ["2015-01-01T00:00:00.000Z", "2115-01-01T00:00:00.000Z"]],
      ["day", 1, ["2019-01-01T00:00:00.000Z"]],
    ];

    TEST_CASES.forEach(([expectedUnit, expectedCount, data]) => {
      it(`should return ${expectedCount} ${expectedUnit}`, () => {
        const { unit, count } = computeDefinedTimeseriesDataInterval(
          data,
          null,
        );
        expect(unit).toBe(expectedUnit);
        expect(count).toBe(expectedCount);
      });
    });

    const units = dateTimeAbsoluteUnits;

    units.forEach((testUnit) => {
      it(`should return one ${testUnit} when ${testUnit} interval is set`, () => {
        const { unit, count } = computeDefinedTimeseriesDataInterval(
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
      const { unit, count } = computeDefinedTimeseriesDataInterval(
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
      const { unit, count } = computeDefinedTimeseriesDataInterval(
        [
          null,
          new Date("2020-01-01").toISOString(),
          null,
          new Date("2020-03-01").toISOString(),
          null,
        ],
        null,
      );
      expect(unit).toBe("month");
      expect(count).toBe(1);
    });
  });

  describe("expectedTickCount", () => {
    const testCases: {
      start: string;
      end: string;
      unit: CartesianChartDateTimeAbsoluteUnit;
      count: number;
      expected: number;
    }[] = [
      {
        start: "2026-01-10",
        end: "2026-02-20",
        unit: "month",
        count: 1,
        expected: 1, // 2026-02-01
      },
      {
        start: "2026-01-28",
        end: "2026-03-02",
        unit: "month",
        count: 1,
        expected: 2, // 2026-02-01, 2026-03-01
      },
      {
        start: "2026-01-01",
        end: "2026-03-01",
        unit: "month",
        count: 1,
        expected: 3, // 2026-01-01, 2026-02-01, 2026-03-01
      },
      {
        start: "2026-01-10",
        end: "2026-01-20",
        unit: "month",
        count: 1,
        expected: 0, // no month boundary in range
      },
      {
        start: "2022-01-01",
        end: "2026-01-01",
        unit: "year",
        count: 1,
        expected: 5, // 2022-01-01, 2023-01-01, 2024-01-01, 2025-01-01, 2026-01-01
      },
      {
        start: "2022-04-01",
        end: "2026-04-01",
        unit: "year",
        count: 1,
        expected: 4, // 2023-01-01, 2024-01-01, 2025-01-01, 2026-01-01
      },
      {
        start: "2020-01-21",
        end: "2020-04-05",
        unit: "month",
        count: 2,
        expected: 1, // 2020-03-01
      },
      {
        start: "2022-01-01",
        end: "2026-01-01",
        unit: "year",
        count: 2,
        expected: 3, // 2022-01-01, 2024-01-01, 2026-01-01
      },
      {
        start: "2023-06-01",
        end: "2027-06-01",
        unit: "year",
        count: 2,
        expected: 2, // 2024-01-01, 2026-01-01
      },
      {
        start: "2025-01-01",
        end: "2026-01-01",
        unit: "quarter",
        count: 1,
        expected: 5, // 2025Q1, 2025Q2, 2025Q3, 2025Q4, 2026Q1
      },
      {
        start: "2024-12-15",
        end: "2025-11-15",
        unit: "quarter",
        count: 2,
        expected: 2, // 2025Q1, 2025Q3
      },
      {
        start: "2025-01-05T00:00:00Z", // Sunday (start of week)
        end: "2025-02-02T00:00:00Z", // Sunday
        unit: "week",
        count: 1,
        expected: 5, // Jan 5, 12, 19, 26, Feb 2
      },
      {
        start: "2025-01-08T00:00:00Z", // Wednesday
        end: "2025-01-22T00:00:00Z", // Wednesday
        unit: "week",
        count: 1,
        expected: 2, // Jan 12, Jan 19
      },
      {
        start: "2025-03-15T00:00:00Z",
        end: "2025-03-20T00:00:00Z",
        unit: "day",
        count: 1,
        expected: 6, // Mar 15, 16, 17, 18, 19, 20
      },
      {
        start: "2025-03-15T12:00:00Z",
        end: "2025-03-20T12:00:00Z",
        unit: "day",
        count: 1,
        expected: 5, // Mar 16, 17, 18, 19, 20
      },
      {
        start: "2025-03-15T00:00:00Z",
        end: "2025-03-15T12:00:00Z",
        unit: "hour",
        count: 3,
        expected: 5, // 0:00, 3:00, 6:00, 9:00, 12:00
      },
      {
        start: "2025-03-15T01:00:00Z",
        end: "2025-03-15T10:00:00Z",
        unit: "hour",
        count: 3,
        expected: 3, // 3:00, 6:00, 9:00
      },
      {
        start: "2025-03-15T10:00:00Z",
        end: "2025-03-15T11:00:00Z",
        unit: "minute",
        count: 15,
        expected: 5, // 10:00, 10:15, 10:30, 10:45, 11:00
      },
      {
        start: "2025-03-15T10:05:00Z",
        end: "2025-03-15T11:05:00Z",
        unit: "minute",
        count: 15,
        expected: 4, // 10:15, 10:30, 10:45, 11:00
      },
      {
        start: "2025-03-15T10:00:00Z",
        end: "2025-03-15T10:02:00Z",
        unit: "second",
        count: 30,
        expected: 5, // :00, :30, 1:00, 1:30, 2:00
      },
      {
        start: "2025-03-15T10:00:10Z",
        end: "2025-03-15T10:02:10Z",
        unit: "second",
        count: 30,
        expected: 4, // :30, 1:00, 1:30, 2:00
      },
      {
        start: "2025-03-15T10:00:00Z",
        end: "2025-03-15T10:00:01Z",
        unit: "ms",
        count: 1,
        expected: 1001,
      },
    ];

    testCases.forEach(({ start, end, unit, count, expected }) => {
      it(`should return ${expected} for ${start} to ${end} with ${unit} interval and count ${count}`, () => {
        expect(
          expectedTickCount({ unit, count }, [
            new Date(start).getTime(),
            new Date(end).getTime(),
          ]),
        ).toBe(expected);
      });
    });
  });

  describe("computeTimeseriesTicksInterval", () => {
    const mockFormatter = (value: RowValue) => String(value);

    type TickInput = {
      xDomain: ContinuousDomain;
      xInterval: TimeSeriesInterval;
      outerWidth: number;
      xTickWidth: number;
    };
    type TickExpected = {
      expectedUnit: CartesianChartDateTimeAbsoluteUnit;
      expectedCount: number;
    };
    const TEST_CASES: [TickInput, TickExpected][] = [
      // on a wide chart, 12 month ticks shouldn't be changed
      [
        {
          xDomain: [
            new Date("2020-01-01").getTime(),
            new Date("2021-01-01").getTime(),
          ],
          xInterval: { unit: "month", count: 1 },
          outerWidth: 1920,
          xTickWidth: 55,
        },
        { expectedUnit: "month", expectedCount: 1 },
      ],
      // 2 month unit should work
      [
        {
          xDomain: [
            new Date("2020-01-01").getTime(),
            new Date("2021-01-01").getTime(),
          ],
          xInterval: { unit: "month", count: 1 },
          outerWidth: 700,
          xTickWidth: 55,
        },
        { expectedUnit: "month", expectedCount: 2 },
      ],
      // it should be bumped to quarters on a narrower chart
      [
        {
          xDomain: [
            new Date("2020-01-01").getTime(),
            new Date("2021-01-01").getTime(),
          ],
          xInterval: { unit: "month", count: 1 },
          outerWidth: 400,
          xTickWidth: 55,
        },
        { expectedUnit: "quarter", expectedCount: 1 },
      ],
      // even narrower and we should show yearly ticks
      [
        {
          xDomain: [
            new Date("2020-01-01").getTime(),
            new Date("2022-01-01").getTime(),
          ],
          xInterval: { unit: "month", count: 1 },
          outerWidth: 300,
          xTickWidth: 55,
        },
        { expectedUnit: "year", expectedCount: 1 },
      ],
      // FIXME: investigate and uncomment
      // shouldn't move to a more granular interval than what was passed
      // [
      //   {
      //     xDomain: [new Date("2020-01-01"), new Date("2021-01-01")],
      //     xInterval: { interval: "month", count: 3 },
      //     outerWidth: 1920,
      //     xTickWidth: 55,
      //   },
      //   { expectedUnit: "month", expectedCount: 3 },
      // ],
      // wide tick labels should update the interval to have fewer ticks
      [
        {
          xDomain: [
            new Date("2020-01-01").getTime(),
            new Date("2022-01-01").getTime(),
          ],
          xInterval: { unit: "month", count: 1 },
          outerWidth: 1920,
          xTickWidth: 418,
        },
        { expectedUnit: "year", expectedCount: 1 },
      ],
    ];

    TEST_CASES.forEach(
      ([
        { xDomain, xInterval, outerWidth, xTickWidth },
        { expectedUnit, expectedCount },
      ]) => {
        it(`should return ${expectedCount} ${expectedUnit}`, () => {
          const { unit, count } = computeTimeseriesTicksInterval(
            xDomain,
            xInterval,
            createMockChartMeasurements(outerWidth, xTickWidth),
            mockFormatter,
          );
          expect(unit).toBe(expectedUnit);
          expect(count).toBe(expectedCount);
        });
      },
    );
  });

  describe("getTimezoneOrOffset", () => {
    const showWarningMock = jest.fn();
    const createTimezoneSeries = ({
      resultsTimezone,
      requestedTimezone,
    }: {
      resultsTimezone?: string;
      requestedTimezone?: string;
    }): RawSeries => [
      createMockSingleSeries(
        { display: "bar" },
        {
          data: {
            results_timezone: resultsTimezone,
            requested_timezone: requestedTimezone,
            cols: [
              createMockColumn({ name: "a", base_type: "type/Text" }),
              createMockColumn({ name: "b", base_type: "type/Integer" }),
            ],
            rows: [],
          },
        },
      ),
    ];

    const series = createTimezoneSeries({ resultsTimezone: "US/Eastern" });

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
      const series = createTimezoneSeries({
        resultsTimezone: "America/New_York",
        requestedTimezone: "America/New_York",
      });
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({
        timezone: "America/New_York",
        offsetMinutes: undefined,
      });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should return the default timezone when results_timezone is undefined", () => {
      const series = createTimezoneSeries({});
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({
        timezone: "Etc/UTC",
        offsetMinutes: undefined,
      });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should return offsetMinutes when results_timezone is in offset format", () => {
      const series = createTimezoneSeries({
        resultsTimezone: "+05:30",
        requestedTimezone: "+05:30",
      });
      const result = getTimezoneOrOffset(series, showWarningMock);
      expect(result).toEqual({ timezone: undefined, offsetMinutes: 330 });
      expect(showWarningMock).not.toHaveBeenCalled();
    });

    it("should show warning when there are multiple timezones in the series", () => {
      const series: RawSeries = [
        ...createTimezoneSeries({ resultsTimezone: "America/New_York" }),
        ...createTimezoneSeries({ resultsTimezone: "Europe/London" }),
      ];
      getTimezoneOrOffset(series, showWarningMock);
      expect(showWarningMock).toHaveBeenCalledTimes(1);
    });

    it("should show warning when requested_timezone is different from results_timezone", () => {
      const series = createTimezoneSeries({
        resultsTimezone: "America/New_York",
        requestedTimezone: "Europe/London",
      });
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
