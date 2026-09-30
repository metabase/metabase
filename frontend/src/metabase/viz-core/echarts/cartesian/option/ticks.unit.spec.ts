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

  it("should give every month of a 12-month series a tick label (metabase#60475)", () => {
    const dateColumn = createMockDatetimeColumn({ unit: "month" });
    const dimensionModel: DimensionModel = {
      column: dateColumn,
      columnIndex: 0,
      columnByCardId: { 1: dateColumn },
      columns: [dateColumn],
    };
    const months = Array.from({ length: 12 }, (_, index) =>
      dayjs.utc("2025-01-01").add(index, "month").format("YYYY-MM-DD"),
    );
    const dataset = months.map((month, index) => ({
      [X_AXIS_DATA_KEY]: month,
      "0": index + 1,
    }));
    const rawSeries = [createMockSingleSeries({ display: "bar" })];
    const settings = createMockVisualizationSettings({
      "graph.x_axis.scale": "timeseries",
    });
    const model = getXAxisModel(dimensionModel, rawSeries, dataset, settings);
    if (!isTimeSeriesAxis(model)) {
      throw new Error("Expected a time-series x-axis model");
    }

    const { minInterval, maxInterval, canRender } = getTicksOptions(
      model,
      createMockChartLayout({ outerWidth: 1200 }),
    );
    const toTickValue = (date: string) =>
      model.fromEChartsAxisValue(
        dayjs(model.toEChartsAxisValue(date)).valueOf(),
      );

    expect(minInterval).toBeUndefined();
    expect(maxInterval).toBe(
      getTimeSeriesIntervalDuration({ count: 1, unit: "day" }),
    );
    expect(months.filter((month) => canRender(toTickValue(month)))).toEqual(
      months,
    );
    expect(canRender(toTickValue("2025-02-15"))).toBe(false);
  });
});
