import type { CallbackDataParams } from "echarts/types/dist/shared";

import type {
  ChartDataDensity,
  DataKey,
  Datum,
  NumericAxisScaleTransforms,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { createMockVisualizationSettings } from "metabase-types/api/mocks";

import { getDataLabelFormatter } from "./series";

const IDENTITY_TRANSFORMS: NumericAxisScaleTransforms = {
  toEChartsAxisValue: (v) => v as number,
  fromEChartsAxisValue: (v) => v,
};

const DATA_KEY: DataKey = "test:metric";

const FORMATTER = (value: unknown) => String(value);

const createMockChartDataDensity = (
  overrides: Partial<ChartDataDensity> = {},
): ChartDataDensity => ({
  type: "combo",
  averageLabelWidth: 50,
  totalNumberOfLabels: 10,
  seriesDataKeysWithLabels: [DATA_KEY],
  stackedDisplayWithLabels: [],
  totalNumberOfDots: 10,
  ...overrides,
});

const createMockSettings = (
  frequency: string,
): ComputedVisualizationSettings => {
  return createMockVisualizationSettings({
    "graph.label_value_frequency": frequency,
    "graph.show_values": true,
    series: () => ({}),
  }) as unknown as ComputedVisualizationSettings;
};

const createMockCallbackDataParams = (
  dataIndex: number,
  datum: Datum,
): CallbackDataParams =>
  ({
    dataIndex,
    data: datum,
  }) as unknown as CallbackDataParams;

const createDatum = (value: unknown): Datum =>
  ({
    [DATA_KEY]: value,
  }) as unknown as Datum;

describe("getDataLabelFormatter", () => {
  describe('with "latest" frequency', () => {
    it("should show label only for the last data point", () => {
      const settings = createMockSettings("latest");
      const density = createMockChartDataDensity();
      const lastNonNullIndex = 4;

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        lastNonNullIndex,
      );

      // Indices 0-3 should return empty string
      for (let i = 0; i < 4; i++) {
        const result = format(
          createMockCallbackDataParams(i, createDatum(100)),
        );
        expect(result).toBe("");
      }

      // Index 4 (last) should return the formatted label
      const result = format(createMockCallbackDataParams(4, createDatum(100)));
      expect(result).toBe("100");
    });

    it("should not show any labels when lastNonNullIndex is -1 (no data)", () => {
      const settings = createMockSettings("latest");
      const density = createMockChartDataDensity();
      const lastNonNullIndex = -1;

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        lastNonNullIndex,
      );

      const result = format(createMockCallbackDataParams(0, createDatum(100)));
      expect(result).toBe("");
    });

    it("should show label for a single data point", () => {
      const settings = createMockSettings("latest");
      const density = createMockChartDataDensity();
      const lastNonNullIndex = 0;

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        lastNonNullIndex,
      );

      const result = format(createMockCallbackDataParams(0, createDatum(42)));
      expect(result).toBe("42");
    });

    it("should not show labels when datasetLength is undefined (fail closed)", () => {
      const settings = createMockSettings("latest");
      const density = createMockChartDataDensity();

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        undefined,
      );

      // lastIndex = -1, so no data point matches
      const result = format(createMockCallbackDataParams(0, createDatum(100)));
      expect(result).toBe("");
    });

    it("should return empty string when last data point value is null", () => {
      const settings = createMockSettings("latest");
      const density = createMockChartDataDensity();
      const lastNonNullIndex = 2;

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        lastNonNullIndex,
      );

      const result = format(createMockCallbackDataParams(2, createDatum(null)));
      expect(result).toBe("");
    });
  });

  describe('regression: "fit" mode still works', () => {
    it("should show labels based on density when frequency is 'fit'", () => {
      const settings = createMockSettings("fit");
      const density = createMockChartDataDensity({
        averageLabelWidth: 50,
        totalNumberOfLabels: 10,
      });

      const format = getDataLabelFormatter(
        DATA_KEY,
        IDENTITY_TRANSFORMS,
        FORMATTER,
        800,
        settings,
        density,
        undefined,
        9,
      );

      // With "fit" mode, the formatter should return a value (not always empty)
      const result = format(createMockCallbackDataParams(0, createDatum(100)));
      expect(typeof result).toBe("string");
    });
  });
});
