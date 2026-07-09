import {
  createMockCartesianChartModel,
  createMockSeriesModel,
} from "__support__/echarts";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { StackModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { SeriesSettings, StackType } from "metabase-types/api";

import { useAreAllDataPointsOutOfRange } from "./use-data-points-visible";

interface SettingsOpts {
  autoRange?: boolean;
  min?: number;
  max?: number;
  stackType?: StackType;
  seriesDisplay?: SeriesSettings["display"];
}

const createSettings = ({
  autoRange = false,
  min,
  max,
  stackType,
  seriesDisplay,
}: SettingsOpts): ComputedVisualizationSettings => ({
  "graph.y_axis.auto_range": autoRange,
  "graph.y_axis.min": min,
  "graph.y_axis.max": max,
  "stackable.stack_type": stackType,
  series: () => ({ display: seriesDisplay }),
});

const CATEGORY_KEYS = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const createStackedChartModel = (display: StackModel["display"] = "bar") =>
  createMockCartesianChartModel({
    seriesModels: CATEGORY_KEYS.map((dataKey) =>
      createMockSeriesModel({ dataKey }),
    ),
    stackModels: [{ axis: "left", display, seriesKeys: CATEGORY_KEYS }],
    dataset: [
      { [X_AXIS_DATA_KEY]: "x", Doohickey: 3, Gadget: 2, Gizmo: 1, Widget: 1 },
    ],
  });

const createSingleSeriesChartModel = (values: (number | null)[]) =>
  createMockCartesianChartModel({
    seriesModels: [createMockSeriesModel({ dataKey: "count" })],
    dataset: values.map((value, index) => ({
      [X_AXIS_DATA_KEY]: index,
      count: value,
    })),
  });

describe("useAreAllDataPointsOutOfRange", () => {
  it("returns false when auto range is enabled", () => {
    expect(
      useAreAllDataPointsOutOfRange(
        createSingleSeriesChartModel([100]),
        createSettings({ autoRange: true, min: 40, max: 60 }),
      ),
    ).toBe(false);
  });

  it("returns false when min or max is not set", () => {
    expect(
      useAreAllDataPointsOutOfRange(
        createSingleSeriesChartModel([100]),
        createSettings({ min: 40 }),
      ),
    ).toBe(false);
  });

  describe("normalized stacks", () => {
    it("returns false when the percent range overlaps the rendered 0–100% stack (metabase#75156)", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createStackedChartModel(),
          createSettings({ min: 49, max: 50.25, stackType: "normalized" }),
        ),
      ).toBe(false);
    });

    it("returns true when the percent range is entirely outside 0–100%", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createStackedChartModel(),
          createSettings({ min: 150, max: 200, stackType: "normalized" }),
        ),
      ).toBe(true);
    });
  });

  describe("stacked series", () => {
    it("returns false when the range intersects the cumulative stack even though no single value is within it", () => {
      const chartModel = createMockCartesianChartModel({
        seriesModels: ["a", "b"].map((dataKey) =>
          createMockSeriesModel({ dataKey }),
        ),
        stackModels: [{ axis: "left", display: "bar", seriesKeys: ["a", "b"] }],
        dataset: [{ [X_AXIS_DATA_KEY]: "x", a: 30, b: 30 }],
      });

      expect(
        useAreAllDataPointsOutOfRange(
          chartModel,
          createSettings({ min: 40, max: 60, stackType: "stacked" }),
        ),
      ).toBe(false);
    });

    it("returns true when the whole stack is below the range", () => {
      const chartModel = createMockCartesianChartModel({
        seriesModels: ["a", "b"].map((dataKey) =>
          createMockSeriesModel({ dataKey }),
        ),
        stackModels: [{ axis: "left", display: "bar", seriesKeys: ["a", "b"] }],
        dataset: [{ [X_AXIS_DATA_KEY]: "x", a: 10, b: 10 }],
      });

      expect(
        useAreAllDataPointsOutOfRange(
          chartModel,
          createSettings({ min: 40, max: 60, stackType: "stacked" }),
        ),
      ).toBe(true);
    });
  });

  describe("unstacked bar series", () => {
    it("returns false when a bar crosses the range even though its end value is above it (metabase#75156)", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([100]),
          createSettings({ min: 40, max: 60, seriesDisplay: "bar" }),
        ),
      ).toBe(false);
    });

    it("returns true when all bars are entirely below the range", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([10, 20]),
          createSettings({ min: 40, max: 60, seriesDisplay: "bar" }),
        ),
      ).toBe(true);
    });
  });

  describe("unstacked area series", () => {
    it("returns false when an area crosses the range even though its end value is above it (metabase#75156)", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([100]),
          createSettings({ min: 40, max: 60, seriesDisplay: "area" }),
        ),
      ).toBe(false);
    });

    it("returns true when all areas are entirely below the range", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([10, 20]),
          createSettings({ min: 40, max: 60, seriesDisplay: "area" }),
        ),
      ).toBe(true);
    });
  });

  describe("unstacked line series", () => {
    it("returns true when every point is out of range", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([100, 30]),
          createSettings({ min: 40, max: 60, seriesDisplay: "line" }),
        ),
      ).toBe(true);
    });

    it("returns false when some point is within range", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([100, 50]),
          createSettings({ min: 40, max: 60, seriesDisplay: "line" }),
        ),
      ).toBe(false);
    });

    it("ignores rows with missing values instead of treating them as visible", () => {
      expect(
        useAreAllDataPointsOutOfRange(
          createSingleSeriesChartModel([100, null]),
          createSettings({ min: 40, max: 60, seriesDisplay: "line" }),
        ),
      ).toBe(true);
    });
  });
});
