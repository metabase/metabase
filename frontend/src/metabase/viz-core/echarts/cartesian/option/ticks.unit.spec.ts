import { createMockChartLayout } from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import {
  createMockDatetimeColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { getXAxisModel } from "../model/axis";
import { isTimeSeriesAxis } from "../model/guards";
import type { DimensionModel, TimeSeriesXAxisModel } from "../model/types";
import { getTimeSeriesIntervalDuration } from "../utils/timeseries";

import { getPadding, getTicksOptions } from "./ticks";

describe("getTicksOptions", () => {
  it("should align padded domain with timezone-naive date-only points under US/Samoa (#56580)", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "day" });
    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
      columns: [dateColumn],
    };
    const first = "2025-03-30";
    const last = "2025-04-01";
    const dataset = [
      { [X_AXIS_DATA_KEY]: first, "0": 10 },
      { [X_AXIS_DATA_KEY]: last, "0": 20 },
    ];
    const rawSeries = [
      createMockSingleSeries(
        { display: "line" },
        { data: { results_timezone: "US/Samoa" } },
      ),
    ];
    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });

    // graph.x_axis.scale is timeseries, so the model should be a TimeSeriesXAxisModel
    const model = getXAxisModel(
      dimensionModel,
      rawSeries,
      dataset,
      settings,
    ) as TimeSeriesXAxisModel;
    expect(isTimeSeriesAxis(model)).toBe(true);

    const { xDomainPadded } = getTicksOptions(model, createMockChartLayout());
    const padding = getPadding(model.intervalsCount);
    const intervalMs = getTimeSeriesIntervalDuration(model.interval);
    const unpaddedMin = xDomainPadded[0] + intervalMs * padding;
    const unpaddedMax = xDomainPadded[1] - intervalMs * padding;

    expect(unpaddedMin).toBe(dayjs(model.toEChartsAxisValue(first)).valueOf());
    expect(unpaddedMax).toBe(dayjs(model.toEChartsAxisValue(last)).valueOf());
    expect(model.toEChartsAxisValue(first)).toBe("2025-03-30T00:00:00Z");
    expect(model.toEChartsAxisValue(last)).toBe("2025-04-01T00:00:00Z");
  });
});

describe("year tick grids", () => {
  const utc = (value: string) => dayjs.utc(value);
  const model = (
    unit: TimeSeriesXAxisModel["interval"]["unit"],
    first: string,
    last: string,
  ): TimeSeriesXAxisModel => ({
    axisType: "time",
    interval: { unit, count: 1 },
    intervalsCount: utc(last).diff(utc(first), unit),
    range: [utc(first), utc(last)],
    formatter: String,
    toEChartsAxisValue: (value) =>
      utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
    fromEChartsAxisValue: (value) => dayjs.utc(value),
  });
  // Every label is 60px wide, so a chart fits one tick per 70px.
  const layout = (outerWidth: number) =>
    createMockChartLayout({
      outerWidth,
      ticksDimensions: { getXTickWidth: () => 60 },
    });
  const rendered = (
    options: ReturnType<typeof getTicksOptions>,
    dates: string[],
  ) => dates.filter((date) => options.canRender(utc(date)));

  it("asks ECharts for every year and starts a two-year grid at the first year in range", () => {
    // Monthly data from March 2019: yearly ticks (2020–2026) do not fit in
    // four slots, so ticks come every two years from January 2020.
    const options = getTicksOptions(
      model("month", "2019-03-01", "2026-04-01"),
      layout(300),
    );

    expect(options.maxInterval).toBe(
      getTimeSeriesIntervalDuration({ unit: "year", count: 1 }),
    );
    expect(options.minInterval).toBeUndefined();
    expect(
      rendered(options, [
        "2019-01-01",
        "2020-01-01",
        "2020-07-01",
        "2021-01-01",
        "2022-01-01",
        "2024-01-01",
        "2026-01-01",
      ]),
    ).toEqual(["2020-01-01", "2022-01-01", "2024-01-01", "2026-01-01"]);
  });

  it("includes a year boundary that falls inside the axis padding", () => {
    // Weekly data from Monday 4 January 2021: the padded axis starts before
    // 1 January, so that boundary anchors the grid.
    const options = getTicksOptions(
      model("week", "2021-01-04", "2026-06-01"),
      layout(300),
    );

    expect(
      rendered(options, ["2021-01-01", "2022-01-01", "2023-01-01"]),
    ).toEqual(["2021-01-01", "2023-01-01"]);
  });

  it("starts finer grids at the first boundary in range too", () => {
    // Daily data from 20 January: two-month ticks start on 1 February.
    const options = getTicksOptions(
      model("day", "2026-01-20", "2026-07-15"),
      layout(300),
    );

    expect(options.maxInterval).toBe(
      getTimeSeriesIntervalDuration({ unit: "day", count: 1 }),
    );
    expect(
      rendered(options, [
        "2026-01-20",
        "2026-02-01",
        "2026-03-01",
        "2026-04-01",
        "2026-06-01",
      ]),
    ).toEqual(["2026-02-01", "2026-04-01", "2026-06-01"]);
  });

  it("steps quarter grids over finer data three months from the first month in range", () => {
    // The same daily data on a narrower chart: only two labels fit, so the
    // grid is quarterly, but anchored on 1 February rather than a calendar
    // quarter.
    const options = getTicksOptions(
      model("day", "2026-01-20", "2026-07-15"),
      layout(180),
    );

    expect(options.maxInterval).toBe(
      getTimeSeriesIntervalDuration({ unit: "month", count: 1 }),
    );
    expect(
      rendered(options, [
        "2026-02-01",
        "2026-04-01",
        "2026-05-01",
        "2026-07-01",
      ]),
    ).toEqual(["2026-02-01", "2026-05-01"]);
  });

  it("keeps quarterly data on calendar quarters", () => {
    // Quarterly points from Q2 2025: half-year ticks start on that quarter.
    const options = getTicksOptions(
      model("quarter", "2025-04-01", "2028-01-01"),
      layout(400),
    );

    expect(
      rendered(options, [
        "2025-04-01",
        "2025-07-01",
        "2025-10-01",
        "2026-01-01",
        "2026-04-01",
      ]),
    ).toEqual(["2025-04-01", "2025-10-01", "2026-04-01"]);
  });

  it("starts sub-day grids at the first hour in range", () => {
    const options = getTicksOptions(
      model("hour", "2026-03-01T01:00:00Z", "2026-03-01T22:00:00Z"),
      layout(560),
    );

    expect(options.maxInterval).toBe(
      getTimeSeriesIntervalDuration({ unit: "hour", count: 1 }),
    );
    expect(
      rendered(options, [
        "2026-03-01T00:00:00Z",
        "2026-03-01T01:00:00Z",
        "2026-03-01T03:00:00Z",
        "2026-03-01T04:00:00Z",
        "2026-03-01T22:00:00Z",
      ]),
    ).toEqual([
      "2026-03-01T01:00:00Z",
      "2026-03-01T04:00:00Z",
      "2026-03-01T22:00:00Z",
    ]);
  });
});

describe("waterfall Total tick", () => {
  const utc = (value: string) => dayjs.utc(value);
  const layout = (outerWidth: number) =>
    createMockChartLayout({
      outerWidth,
      ticksDimensions: { getXTickWidth: () => 60 },
    });
  const rendered = (
    options: ReturnType<typeof getTicksOptions>,
    dates: string[],
  ) => dates.filter((date) => options.canRender(utc(date)));
  const waterfallModel = (
    unit: TimeSeriesXAxisModel["interval"]["unit"],
    first: string,
    total: string,
  ): TimeSeriesXAxisModel & { totalXValue: string } => ({
    axisType: "time",
    interval: { unit, count: 1 },
    intervalsCount: utc(total).diff(utc(first), unit),
    range: [utc(first), utc(total)],
    formatter: String,
    toEChartsAxisValue: (value: unknown) =>
      utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
    fromEChartsAxisValue: (value: number) => dayjs.utc(value),
    totalXValue: utc(total).toISOString(),
  });

  it("drops the grid tick crowded by the Total of a multi-year grid", () => {
    // Yearly data 2024–2034 with Total at 2035: five-year ticks start at 2024,
    // and 2034 gives way to the Total one year later.
    const options = getTicksOptions(
      waterfallModel("year", "2024-01-01", "2035-01-01"),
      layout(300),
    );

    expect(
      rendered(options, [
        "2024-01-01",
        "2025-01-01",
        "2029-01-01",
        "2034-01-01",
        "2035-01-01",
      ]),
    ).toEqual(["2024-01-01", "2029-01-01", "2035-01-01"]);
  });

  it("drops the grid tick crowded by the Total of finer grids as well", () => {
    // Monthly data January–July with Total in August: two-month ticks start
    // in January, and July gives way to the Total a month later.
    const options = getTicksOptions(
      waterfallModel("month", "2025-01-01", "2025-08-01"),
      layout(300),
    );

    expect(
      rendered(options, [
        "2025-01-01",
        "2025-02-01",
        "2025-03-01",
        "2025-07-01",
        "2025-08-01",
      ]),
    ).toEqual(["2025-01-01", "2025-03-01", "2025-08-01"]);
  });

  it("labels a Total that is not on the grid's unit", () => {
    // Daily data with a two-year grid: the Total sits a day after the last
    // point and is labeled, while the year boundary three months before it
    // gives way.
    const options = getTicksOptions(
      waterfallModel("day", "2019-03-01", "2026-04-02"),
      layout(300),
    );

    expect(
      rendered(options, [
        "2024-01-01",
        "2026-01-01",
        "2026-04-02",
        "2026-04-03",
      ]),
    ).toEqual(["2024-01-01", "2026-04-02"]);
  });
});
