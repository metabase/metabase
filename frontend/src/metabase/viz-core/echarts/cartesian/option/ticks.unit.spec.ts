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

describe("tick grid anchoring", () => {
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

  it("starts two-year ticks at the first year boundary inside the range", () => {
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

  it("starts two-month ticks at the first month boundary inside the range", () => {
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
        "2026-07-01",
      ]),
    ).toEqual(["2026-02-01", "2026-04-01", "2026-06-01"]);
  });

  it("starts two-week ticks on the first data week", () => {
    const options = getTicksOptions(
      model("week", "2021-01-04", "2021-05-17"),
      layout(800),
    );

    expect(
      rendered(options, [
        "2021-01-03",
        "2021-01-04",
        "2021-01-11",
        "2021-01-18",
        "2021-02-01",
      ]),
    ).toEqual(["2021-01-04", "2021-01-18", "2021-02-01"]);
  });

  it("starts two-quarter ticks at the first quarter boundary inside the range", () => {
    const options = getTicksOptions(
      model("month", "2025-02-01", "2027-12-01"),
      layout(560),
    );

    expect(
      rendered(options, [
        "2025-01-01",
        "2025-04-01",
        "2025-07-01",
        "2025-10-01",
        "2026-04-01",
      ]),
    ).toEqual(["2025-04-01", "2025-10-01", "2026-04-01"]);
  });

  it("lets ECharts emit every day when daily ticks fit", () => {
    const options = getTicksOptions(
      model("day", "2026-03-01", "2026-03-05"),
      layout(800),
    );

    expect(options.maxInterval).toBe(
      getTimeSeriesIntervalDuration({ unit: "day", count: 1 }),
    );
    expect(
      rendered(options, ["2026-03-01", "2026-03-02", "2026-03-03"]),
    ).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
  });

  it("starts three-hour ticks at the first hour inside the range", () => {
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
