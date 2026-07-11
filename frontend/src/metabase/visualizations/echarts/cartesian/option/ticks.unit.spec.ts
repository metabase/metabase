import dayjs from "dayjs";

import type { ChartLayout } from "../layout/types";
import type { TimeSeriesXAxisModel } from "../model/types";
import { getTimeSeriesIntervalDuration } from "../utils/timeseries";

import { getTicksOptions } from "./ticks";

const createMonthlyXAxisModel = (): TimeSeriesXAxisModel => {
  // 12 months of data: Jan 2025 .. Dec 2025 bucketed by month.
  const range: [dayjs.Dayjs, dayjs.Dayjs] = [
    dayjs("2025-01-01T00:00:00.000Z"),
    dayjs("2025-12-01T00:00:00.000Z"),
  ];

  return {
    axisType: "time",
    interval: { count: 1, unit: "month" },
    intervalsCount: 11,
    range,
    // identity transform: axis value is the ISO string itself
    toEChartsAxisValue: (value) => (value == null ? null : String(value)),
    fromEChartsAxisValue: (value) => dayjs(value),
    formatter: () => "Jan",
  };
};

// A wide chart with tiny tick widths so the tick-interval computation keeps the
// monthly interval (i.e. every month can fit) rather than collapsing to quarters.
const createChartLayout = (): ChartLayout =>
  ({
    outerWidth: 1600,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ticksDimensions: {
      getXTickWidth: () => 10,
    },
  }) as unknown as ChartLayout;

describe("getTicksOptions - monthly ticks (metabase#60475)", () => {
  it("forces daily tick generation filtered to month starts so no month is skipped", () => {
    const { minInterval, maxInterval, canRender } = getTicksOptions(
      createMonthlyXAxisModel(),
      createChartLayout(),
    );

    const dayDuration = getTimeSeriesIntervalDuration({
      count: 1,
      unit: "day",
    });

    // The fix drives ECharts with a daily maxInterval (not a fixed monthly
    // minInterval, which is what caused short months like February to be
    // skipped). Reverting the fix leaves maxInterval undefined and sets
    // minInterval to the month duration instead.
    expect(maxInterval).toBe(dayDuration);
    expect(minInterval).toBeUndefined();

    // Month starts render; mid-month daily ticks are filtered out. With the fix
    // reverted, canRender degrades to a plain in-range check and would return
    // true for a mid-month date.
    expect(canRender(dayjs("2025-06-01T00:00:00.000Z"))).toBe(true);
    expect(canRender(dayjs("2025-06-15T00:00:00.000Z"))).toBe(false);
  });
});

const createSingleYearChartLayout = (): ChartLayout =>
  ({
    outerWidth: 1000,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    ticksDimensions: { getXTickWidth: () => 30 },
  }) as unknown as ChartLayout;

// A single-point year domain: a bar chart aggregated by year, filtered to a
// single year (2025). This is the metabase#63671 repro shape.
const createSingleYearModel = (): TimeSeriesXAxisModel =>
  ({
    axisType: "time",
    interval: { count: 1, unit: "year" },
    intervalsCount: 0,
    range: [
      dayjs("2025-01-01T00:00:00.000Z"),
      dayjs("2025-01-01T00:00:00.000Z"),
    ],
    toEChartsAxisValue: (value) => (value == null ? null : String(value)),
    fromEChartsAxisValue: (value) => dayjs(value),
    formatter: (value) => dayjs(value as string).format("YYYY"),
  }) as unknown as TimeSeriesXAxisModel;

describe("getTicksOptions — single-year x-axis (metabase#63671)", () => {
  it("renders the start-of-year tick", () => {
    const { canRender } = getTicksOptions(
      createSingleYearModel(),
      createSingleYearChartLayout(),
    );

    expect(canRender(dayjs("2025-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("rejects intermediate (mid-year) ticks so the year label is not duplicated", () => {
    const { canRender } = getTicksOptions(
      createSingleYearModel(),
      createSingleYearChartLayout(),
    );

    // ECharts 6.1.0 emits a mid-year tick inside the padded single-point
    // domain; it formats as "2025" and duplicates the label unless filtered.
    expect(canRender(dayjs("2025-07-01T00:00:00.000Z"))).toBe(false);
  });
});
