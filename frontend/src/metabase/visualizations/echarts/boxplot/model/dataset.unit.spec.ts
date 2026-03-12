import { createMockSeriesModel } from "__support__/echarts";
import { checkNumber } from "metabase/lib/types";
import {
  INDEX_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  ChartDataset,
  NumericAxisScaleTransforms,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { RowValue } from "metabase-types/api";

import { getBoxPlotStatKey } from "../utils";

import { computeMultiSeriesBoxPlotData } from "./dataset";
import type { BoxPlotSeriesModel } from "./types";

const yAxisScaleTransforms: NumericAxisScaleTransforms = {
  toEChartsAxisValue: (value: RowValue) => checkNumber(value),
  fromEChartsAxisValue: (value: number) => value,
};

const createMockBoxPlotSeriesModel = (
  opts?: Partial<BoxPlotSeriesModel>,
): BoxPlotSeriesModel => createMockSeriesModel(opts) as BoxPlotSeriesModel;

describe("computeMultiSeriesBoxPlotData", () => {
  describe("basic statistics calculation", () => {
    it("should compute correct boxplot statistics for a single series", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.xValue).toBe("A");
      expect(datum?.seriesKey).toBe("series1");
      expect(datum?.seriesIndex).toBe(0);
      expect(datum?.min).toBe(1);
      expect(datum?.q1).toBe(2);
      expect(datum?.median).toBe(3);
      expect(datum?.q3).toBe(4);
      expect(datum?.max).toBe(5);
      expect(datum?.mean).toBe(3);
      expect(datum?.outliers).toEqual([]);
      expect(datum?.rawDataPoints).toEqual([
        { value: 1, datum: { [X_AXIS_DATA_KEY]: "A", series1: 1 }, index: 0 },
        { value: 2, datum: { [X_AXIS_DATA_KEY]: "A", series1: 2 }, index: 1 },
        { value: 3, datum: { [X_AXIS_DATA_KEY]: "A", series1: 3 }, index: 2 },
        { value: 4, datum: { [X_AXIS_DATA_KEY]: "A", series1: 4 }, index: 3 },
        { value: 5, datum: { [X_AXIS_DATA_KEY]: "A", series1: 5 }, index: 4 },
      ]);
    });

    it("should compute correct quantiles with interpolation", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.min).toBe(1);
      expect(datum?.q1).toBe(1.75);
      expect(datum?.median).toBe(2.5);
      expect(datum?.q3).toBe(3.25);
      expect(datum?.max).toBe(4);
      expect(datum?.mean).toBe(2.5);
    });

    it("should handle single data point", () => {
      const dataset: ChartDataset = [{ [X_AXIS_DATA_KEY]: "A", series1: 42 }];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.min).toBe(42);
      expect(datum?.q1).toBe(42);
      expect(datum?.median).toBe(42);
      expect(datum?.q3).toBe(42);
      expect(datum?.max).toBe(42);
      expect(datum?.mean).toBe(42);
      expect(datum?.outliers).toEqual([]);
    });
  });

  describe("whisker types", () => {
    it("should use min/max as whiskers when whiskerType is 'min-max'", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
        { [X_AXIS_DATA_KEY]: "A", series1: 100 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(100);
      expect(datum?.outliers).toEqual([]);
    });

    it("should detect upper outliers using tukey when whiskerType is 'tukey'", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
        { [X_AXIS_DATA_KEY]: "A", series1: 100 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "tukey",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      // q1=1.75, q3=4.25, IQR=2.5, upper bound = 4.25 + 1.5*2.5 = 8
      // 100 > 8 so it's an outlier, max whisker is 5
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(5);
      expect(datum?.outliers).toEqual([100]);
    });

    it("should detect lower outliers using tukey when whiskerType is 'tukey'", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: -100 },
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "tukey",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      // q1=1.25, q3=4, IQR=2.75, lower bound = 1.25 - 1.5*2.75 = -2.875
      // -100 < -2.875 so it's an outlier, min whisker is 1
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(5);
      expect(datum?.outliers).toEqual([-100]);
    });

    it("should detect both upper and lower outliers", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: -100 },
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
        { [X_AXIS_DATA_KEY]: "A", series1: 100 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "tukey",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(5);
      expect(datum?.outliers).toEqual([-100, 100]);
    });
  });

  describe("multiple x-values", () => {
    it("should compute statistics separately for each x-value", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 10 },
        { [X_AXIS_DATA_KEY]: "A", series1: 20 },
        { [X_AXIS_DATA_KEY]: "B", series1: 100 },
        { [X_AXIS_DATA_KEY]: "B", series1: 200 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      expect(result.xValues).toEqual(["A", "B"]);

      const datumA = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datumA?.min).toBe(10);
      expect(datumA?.max).toBe(20);
      expect(datumA?.mean).toBe(15);

      const datumB = result.dataBySeriesAndXValue.get("series1")?.get("B");
      expect(datumB?.min).toBe(100);
      expect(datumB?.max).toBe(200);
      expect(datumB?.mean).toBe(150);
    });
  });

  describe("multiple series", () => {
    it("should compute statistics for each series independently", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1, series2: 10 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2, series2: 20 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3, series2: 30 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
        createMockBoxPlotSeriesModel({ dataKey: "series2" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum1 = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum1?.seriesIndex).toBe(0);
      expect(datum1?.min).toBe(1);
      expect(datum1?.max).toBe(3);
      expect(datum1?.mean).toBe(2);

      const datum2 = result.dataBySeriesAndXValue.get("series2")?.get("A");
      expect(datum2?.seriesIndex).toBe(1);
      expect(datum2?.min).toBe(10);
      expect(datum2?.max).toBe(30);
      expect(datum2?.mean).toBe(20);
    });
  });

  describe("boxDataset output", () => {
    it("should build boxDataset with correct stat keys", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      expect(result.boxDataset).toEqual([
        {
          [X_AXIS_DATA_KEY]: "A",
          [getBoxPlotStatKey("series1", "min")]: 1,
          [getBoxPlotStatKey("series1", "q1")]: 1.5,
          [getBoxPlotStatKey("series1", "median")]: 2,
          [getBoxPlotStatKey("series1", "q3")]: 2.5,
          [getBoxPlotStatKey("series1", "max")]: 3,
          [getBoxPlotStatKey("series1", "mean")]: 2,
        },
      ]);
    });

    it("should build boxDataset for multiple x-values and series", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1, series2: 10 },
        { [X_AXIS_DATA_KEY]: "B", series1: 2, series2: 20 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
        createMockBoxPlotSeriesModel({ dataKey: "series2" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      expect(result.boxDataset).toEqual([
        {
          [X_AXIS_DATA_KEY]: "A",
          [getBoxPlotStatKey("series1", "min")]: 1,
          [getBoxPlotStatKey("series1", "q1")]: 1,
          [getBoxPlotStatKey("series1", "median")]: 1,
          [getBoxPlotStatKey("series1", "q3")]: 1,
          [getBoxPlotStatKey("series1", "max")]: 1,
          [getBoxPlotStatKey("series1", "mean")]: 1,
          [getBoxPlotStatKey("series2", "min")]: 10,
          [getBoxPlotStatKey("series2", "q1")]: 10,
          [getBoxPlotStatKey("series2", "median")]: 10,
          [getBoxPlotStatKey("series2", "q3")]: 10,
          [getBoxPlotStatKey("series2", "max")]: 10,
          [getBoxPlotStatKey("series2", "mean")]: 10,
        },
        {
          [X_AXIS_DATA_KEY]: "B",
          [getBoxPlotStatKey("series1", "min")]: 2,
          [getBoxPlotStatKey("series1", "q1")]: 2,
          [getBoxPlotStatKey("series1", "median")]: 2,
          [getBoxPlotStatKey("series1", "q3")]: 2,
          [getBoxPlotStatKey("series1", "max")]: 2,
          [getBoxPlotStatKey("series1", "mean")]: 2,
          [getBoxPlotStatKey("series2", "min")]: 20,
          [getBoxPlotStatKey("series2", "q1")]: 20,
          [getBoxPlotStatKey("series2", "median")]: 20,
          [getBoxPlotStatKey("series2", "q3")]: 20,
          [getBoxPlotStatKey("series2", "max")]: 20,
          [getBoxPlotStatKey("series2", "mean")]: 20,
        },
      ]);
    });
  });

  describe("points datasets", () => {
    it("should separate outliers above and below into different datasets", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: -100 },
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", series1: 5 },
        { [X_AXIS_DATA_KEY]: "A", series1: 100 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "tukey",
        yAxisScaleTransforms,
      );

      expect(result.outlierAbovePointsDataset).toEqual([
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 6, series1: 100 },
      ]);

      expect(result.outlierBelowPointsDataset).toEqual([
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 0, series1: -100 },
      ]);

      expect(result.nonOutlierPointsDataset).toEqual([
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 1, series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 2, series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 3, series1: 3 },
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 4, series1: 4 },
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 5, series1: 5 },
      ]);
    });

    it("should have empty outlier datasets when using min-max whiskers", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: 100 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      expect(result.outlierAbovePointsDataset).toEqual([]);
      expect(result.outlierBelowPointsDataset).toEqual([]);
      expect(result.nonOutlierPointsDataset).toEqual([
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 0, series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 1, series1: 100 },
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty dataset", () => {
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        [],
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      expect(result.xValues).toEqual([]);
      expect(result.boxDataset).toEqual([]);
      expect(result.outlierAbovePointsDataset).toEqual([]);
      expect(result.outlierBelowPointsDataset).toEqual([]);
      expect(result.nonOutlierPointsDataset).toEqual([]);
      expect(result.dataBySeriesAndXValue.get("series1")?.size).toBe(0);
    });

    it("should ignore non-numeric values", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: null },
        { [X_AXIS_DATA_KEY]: "A", series1: "invalid" },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
        { [X_AXIS_DATA_KEY]: "A", series1: NaN },
        { [X_AXIS_DATA_KEY]: "A", series1: 3 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.rawDataPoints.length).toBe(3);
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(3);
      expect(datum?.mean).toBe(2);
    });

    it("should ignore Infinity values", () => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", series1: 1 },
        { [X_AXIS_DATA_KEY]: "A", series1: Infinity },
        { [X_AXIS_DATA_KEY]: "A", series1: -Infinity },
        { [X_AXIS_DATA_KEY]: "A", series1: 2 },
      ];
      const seriesModels = [
        createMockBoxPlotSeriesModel({ dataKey: "series1" }),
      ];

      const result = computeMultiSeriesBoxPlotData(
        dataset,
        X_AXIS_DATA_KEY,
        seriesModels,
        "min-max",
        yAxisScaleTransforms,
      );

      const datum = result.dataBySeriesAndXValue.get("series1")?.get("A");
      expect(datum?.rawDataPoints.length).toBe(2);
      expect(datum?.min).toBe(1);
      expect(datum?.max).toBe(2);
    });
  });
});
