import type {
  MetricBreakoutValuesResponse,
  RowValues,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockDatasetData } from "metabase-types/api/mocks/dataset";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import type { BreakoutColorMap, MetricSourceId } from "../types/viewer-state";

import {
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupDefinitionWithBreakout,
  setupMeasureDefinition,
} from "./__tests__/test-helpers";
import {
  buildCartesianVizSettings,
  computeBreakoutColorSettings,
  computeColorVizSettings,
  computeSourceBreakoutColors,
  getSelectedMetricsInfo,
  splitByBreakout,
} from "./series";

const dimensionCol = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  base_type: "type/DateTime",
});

const breakoutCol = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});

const metricCol = createMockColumn({
  name: "COUNT",
  display_name: "Count",
  base_type: "type/Integer",
});

const CARD_OPTS = { id: 1, name: "Revenue", display: "line" } as const;

function makeColorMap(values: string[]): BreakoutColorMap {
  const palette = [
    "#509EE3",
    "#88BF4D",
    "#A989C5",
    "#EF8C8C",
    "#F9D45C",
    "#F2A86F",
  ];
  return new Map(values.map((v, i) => [v, palette[i % palette.length]]));
}

describe("splitByBreakout", () => {
  describe("3 columns: [dimension, breakout, metric]", () => {
    it("splits rows by breakout value and strips breakout column", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [dimensionCol, breakoutCol, metricCol],
          rows: [
            ["2024-01", "Gadgets", 10],
            ["2024-01", "Widgets", 20],
            ["2024-02", "Gadgets", 30],
            ["2024-02", "Widgets", 40],
          ],
        },
      });

      const { series: result } = splitByBreakout(
        series,
        1,
        true,
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["2024-01", 10],
        ["2024-02", 30],
      ]);
      expect(result[0].card.name).toBe("Gadgets");

      expect(result[1].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[1].data.rows).toEqual([
        ["2024-01", 20],
        ["2024-02", 40],
      ]);
      expect(result[1].card.name).toBe("Widgets");
    });

    it("prefixes breakout value with card name when seriesCount > 1", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [dimensionCol, breakoutCol, metricCol],
          rows: [
            ["2024-01", "Gadgets", 10],
            ["2024-01", "Widgets", 20],
          ],
        },
      });

      const { series: result } = splitByBreakout(
        series,
        2,
        true,
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result[0].card.name).toBe("Revenue: Gadgets");
      expect(result[1].card.name).toBe("Revenue: Widgets");
    });
  });

  describe("2 columns: [breakout, metric] (dimension == breakout)", () => {
    it("splits rows by breakout value and keeps both columns", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [breakoutCol, metricCol],
          rows: [
            ["Gadgets", 10],
            ["Widgets", 20],
            ["Gadgets", 30],
          ],
        },
      });

      const { series: result } = splitByBreakout(
        series,
        1,
        true,
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["Gadgets", 10],
        ["Gadgets", 30],
      ]);
      expect(result[0].card.name).toBe("Gadgets");

      expect(result[1].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[1].data.rows).toEqual([["Widgets", 20]]);
      expect(result[1].card.name).toBe("Widgets");
    });
  });

  it("assigns unique card ids to each split series", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const { series: result } = splitByBreakout(
      series,
      1,
      true,
      makeColorMap(["Gadgets", "Widgets"]),
    );

    const ids = result.map((s) => s.card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies source colors to series settings", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const colorMap = makeColorMap(["Gadgets", "Widgets"]);
    const { series: result } = splitByBreakout(series, 1, true, colorMap);

    expect(result[0].card.visualization_settings.series_settings).toBeDefined();
    expect(result[1].card.visualization_settings.series_settings).toBeDefined();
  });

  it("returns original series when breakout values exceed MAX_SERIES", () => {
    const values = Array.from({ length: 102 }, (_, i) => `Value ${i}`);
    const rows: RowValues[] = values.map((v, i) => ["2024-01", v, i]);
    const series = createMockSingleSeries(CARD_OPTS, {
      data: { cols: [dimensionCol, breakoutCol, metricCol], rows },
    });

    const { series: result } = splitByBreakout(
      series,
      1,
      true,
      makeColorMap(values),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(series);
  });

  it("shares the same cols reference across all split series", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const { series: result } = splitByBreakout(
      series,
      1,
      true,
      makeColorMap(["Gadgets", "Widgets"]),
    );

    expect(result[0].data.cols).toBe(result[1].data.cols);
  });

  it("skips breakout values not present in data", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Widgets", 20],
          ["2024-02", "Widgets", 40],
        ],
      },
    });

    const colorMap: BreakoutColorMap = new Map([
      ["Gadgets", "#509EE3"],
      ["Widgets", "#88BF4D"],
      ["Gizmos", "#A989C5"],
    ]);

    const { series: result, activeBreakoutColorMap } = splitByBreakout(
      series,
      1,
      true,
      colorMap,
    );

    expect(result).toHaveLength(1);
    expect(result[0].card.name).toBe("Widgets");
    expect(activeBreakoutColorMap).toEqual(new Map([["Widgets", "#88BF4D"]]));
  });

  it("preserves color assignment regardless of data order", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Widgets", 20],
          ["2024-01", "Gadgets", 10],
        ],
      },
    });

    const colorMap: BreakoutColorMap = new Map([
      ["Gadgets", "#509EE3"],
      ["Widgets", "#88BF4D"],
    ]);

    const { series: result } = splitByBreakout(series, 1, true, colorMap);

    expect(result).toHaveLength(2);
    // series order follows colorMap iteration order, not data order
    expect(result[0].card.name).toBe("Gadgets");
    expect(result[1].card.name).toBe("Widgets");

    const gadgetColor =
      result[0].card.visualization_settings.series_settings?.[
        Object.keys(
          result[0].card.visualization_settings.series_settings ?? {},
        )[0]
      ]?.color;
    const widgetColor =
      result[1].card.visualization_settings.series_settings?.[
        Object.keys(
          result[1].card.visualization_settings.series_settings ?? {},
        )[0]
      ]?.color;

    expect(gadgetColor).toBe("#509EE3");
    expect(widgetColor).toBe("#88BF4D");
  });
});

describe("computeSourceBreakoutColors", () => {
  it("returns empty object for empty definitions", () => {
    expect(computeSourceBreakoutColors([])).toEqual({});
  });

  it("returns a string color for a definition without breakout", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);

    const result = computeSourceBreakoutColors([
      { id: "metric:1", definition },
    ]);

    expect(typeof result["metric:1"]).toBe("string");
  });

  it("returns a Map for a definition with breakout and breakout values", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );

    const breakoutValues = new Map<
      MetricSourceId,
      MetricBreakoutValuesResponse
    >([
      [
        "metric:1",
        {
          values: ["Gadgets", "Widgets"],
          col: createMockColumn({
            name: "CATEGORY",
            display_name: "Category",
            base_type: "type/Text",
          }),
        },
      ],
    ]);

    const result = computeSourceBreakoutColors(
      [{ id: "metric:1", definition }],
      breakoutValues,
    );

    expect(result["metric:1"]).toBeInstanceOf(Map);
    const colorMap = result["metric:1"] as Map<string, string>;
    expect(colorMap.size).toBe(2);
    expect(colorMap.has("Gadgets")).toBe(true);
    expect(colorMap.has("Widgets")).toBe(true);
    expect(typeof colorMap.get("Gadgets")).toBe("string");
    expect(typeof colorMap.get("Widgets")).toBe("string");
  });

  it("returns mixed types for definitions with and without breakouts", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const withBreakout = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );
    const withoutBreakout = setupDefinition(metadata, REVENUE_METRIC.id);

    const breakoutValues = new Map<
      MetricSourceId,
      MetricBreakoutValuesResponse
    >([
      [
        "metric:1",
        {
          values: ["Gadgets", "Widgets"],
          col: createMockColumn({
            name: "CATEGORY",
            display_name: "Category",
            base_type: "type/Text",
          }),
        },
      ],
    ]);

    const result = computeSourceBreakoutColors(
      [
        { id: "metric:1", definition: withBreakout },
        { id: "metric:2" as MetricSourceId, definition: withoutBreakout },
      ],
      breakoutValues,
    );

    expect(result["metric:1"]).toBeInstanceOf(Map);
    expect(typeof result["metric:2" as MetricSourceId]).toBe("string");
  });

  it("falls back to string when breakout definition has no breakout values", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );

    const result = computeSourceBreakoutColors(
      [{ id: "metric:1", definition }],
      new Map(),
    );

    expect(typeof result["metric:1"]).toBe("string");
  });
});

describe("buildCartesianVizSettings", () => {
  describe("without breakout", () => {
    const data = createMockDatasetData({
      cols: [dimensionCol, metricCol],
      rows: [
        ["2024-01", 10],
        ["2024-02", 20],
      ],
    });

    it("sets single dimension and metric from data columns", () => {
      const result = buildCartesianVizSettings(data, false, false, "Revenue");

      expect(result["graph.dimensions"]).toEqual(["CREATED_AT"]);
      expect(result["graph.metrics"]).toEqual(["COUNT"]);
    });

    it("disables axis labels", () => {
      const result = buildCartesianVizSettings(data, false, false, "Revenue");

      expect(result["graph.x_axis.labels_enabled"]).toBe(false);
      expect(result["graph.y_axis.labels_enabled"]).toBe(false);
    });
  });

  describe("with breakout", () => {
    const data = createMockDatasetData({
      cols: [dimensionCol, breakoutCol, metricCol],
      rows: [
        ["2024-01", "Gadgets", 10],
        ["2024-01", "Widgets", 20],
        ["2024-02", "Gadgets", 30],
        ["2024-02", "Widgets", 40],
      ],
    });

    it("includes breakout column in graph.dimensions", () => {
      const result = buildCartesianVizSettings(data, true, false, "Revenue");

      expect(result["graph.dimensions"]).toEqual(["CREATED_AT", "CATEGORY"]);
      expect(result["graph.metrics"]).toEqual(["COUNT"]);
    });

    it("sets series_settings colors from breakout color map", () => {
      const result = buildCartesianVizSettings(
        data,
        true,
        false,
        "Revenue",
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result.series_settings).toEqual({
        Gadgets: { color: "#509EE3" },
        Widgets: { color: "#88BF4D" },
      });
    });

    it("prefixes color keys with card name when hasMultipleCards is true", () => {
      const result = buildCartesianVizSettings(
        data,
        true,
        true,
        "Revenue",
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result.series_settings).toEqual({
        "Revenue: Gadgets": { color: "#509EE3" },
        "Revenue: Widgets": { color: "#88BF4D" },
      });
    });

    it("preserves breakout colors regardless of data row order", () => {
      const reorderedData = createMockDatasetData({
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Widgets", 20],
          ["2024-01", "Gadgets", 10],
        ],
      });

      const result = buildCartesianVizSettings(
        reorderedData,
        true,
        false,
        "Revenue",
        makeColorMap(["Gadgets", "Widgets"]),
      );

      expect(result.series_settings).toEqual({
        Gadgets: { color: "#509EE3" },
        Widgets: { color: "#88BF4D" },
      });
    });
  });
});

describe("computeBreakoutColorSettings", () => {
  it("maps breakout values to series_settings keyed by formatted name", () => {
    const colorMap = makeColorMap(["Gadgets", "Widgets"]);
    const result = computeBreakoutColorSettings(
      colorMap,
      breakoutCol,
      false,
      "Revenue",
    );

    expect(result).toEqual({
      series_settings: {
        Gadgets: { color: "#509EE3" },
        Widgets: { color: "#88BF4D" },
      },
    });
  });

  it("prefixes series names with card name when hasMultipleCards is true", () => {
    const colorMap = makeColorMap(["Gadgets", "Widgets"]);
    const result = computeBreakoutColorSettings(
      colorMap,
      breakoutCol,
      true,
      "Revenue",
    );

    expect(result).toEqual({
      series_settings: {
        "Revenue: Gadgets": { color: "#509EE3" },
        "Revenue: Widgets": { color: "#88BF4D" },
      },
    });
  });
});

describe("computeColorVizSettings", () => {
  it("returns empty object when color is undefined", () => {
    expect(
      computeColorVizSettings({
        displayType: "line",
        seriesKey: "COUNT",
        color: undefined,
      }),
    ).toEqual({});
  });

  it("returns series_settings for non-map display types", () => {
    expect(
      computeColorVizSettings({
        displayType: "line",
        seriesKey: "COUNT",
        color: "#509EE3",
      }),
    ).toEqual({
      series_settings: {
        COUNT: { color: "#509EE3" },
      },
    });
  });

  it("returns map.colors for map display type", () => {
    const result = computeColorVizSettings({
      displayType: "map",
      seriesKey: "COUNT",
      color: "#509EE3",
    });

    expect(result).toHaveProperty(["map.colors"]);
    expect(result).not.toHaveProperty("series_settings");
  });
});

describe("getSelectedMetricsInfo", () => {
  const metricMetadata = createMetricMetadata([REVENUE_METRIC]);
  const metricDefinition = setupDefinition(metricMetadata, REVENUE_METRIC.id);
  const measureDefinition = setupMeasureDefinition(
    measureMetadata,
    TOTAL_MEASURE.id,
  );

  describe("metric definition", () => {
    it("extracts metric id, name, and sourceType", () => {
      const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
      const result = getSelectedMetricsInfo(
        [{ id: sourceId, definition: metricDefinition }],
        new Set(),
      );

      expect(result).toEqual([
        {
          id: REVENUE_METRIC.id,
          sourceType: "metric",
          name: "Revenue",
          isLoading: false,
        },
      ]);
    });

    it("marks entry as loading when id is in loadingIds", () => {
      const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
      const result = getSelectedMetricsInfo(
        [{ id: sourceId, definition: metricDefinition }],
        new Set([sourceId]),
      );

      expect(result).toEqual([
        {
          id: REVENUE_METRIC.id,
          sourceType: "metric",
          name: "Revenue",
          isLoading: true,
        },
      ]);
    });
  });

  describe("measure definition", () => {
    it("extracts measure id, name, tableId, and sourceType", () => {
      const sourceId: MetricSourceId = `measure:${TOTAL_MEASURE.id}`;
      const result = getSelectedMetricsInfo(
        [{ id: sourceId, definition: measureDefinition }],
        new Set(),
      );

      expect(result).toEqual([
        {
          id: TOTAL_MEASURE.id,
          sourceType: "measure",
          name: "Total Revenue",
          isLoading: false,
          tableId: ORDERS_ID,
        },
      ]);
    });
  });

  it("handles multiple entries in order", () => {
    const metricSourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
    const measureSourceId: MetricSourceId = `measure:${TOTAL_MEASURE.id}`;

    const result = getSelectedMetricsInfo(
      [
        { id: metricSourceId, definition: metricDefinition },
        { id: measureSourceId, definition: measureDefinition },
      ],
      new Set(),
    );

    expect(result).toEqual([
      {
        id: REVENUE_METRIC.id,
        sourceType: "metric",
        name: "Revenue",
        isLoading: false,
      },
      {
        id: TOTAL_MEASURE.id,
        sourceType: "measure",
        name: "Total Revenue",
        isLoading: false,
        tableId: ORDERS_ID,
      },
    ]);
  });

  it("sets isLoading per entry based on loadingIds", () => {
    const metricSourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
    const measureSourceId: MetricSourceId = `measure:${TOTAL_MEASURE.id}`;

    const result = getSelectedMetricsInfo(
      [
        { id: metricSourceId, definition: metricDefinition },
        { id: measureSourceId, definition: measureDefinition },
      ],
      new Set([measureSourceId]),
    );

    expect(result).toEqual([
      {
        id: REVENUE_METRIC.id,
        sourceType: "metric",
        name: "Revenue",
        isLoading: false,
      },
      {
        id: TOTAL_MEASURE.id,
        sourceType: "measure",
        name: "Total Revenue",
        isLoading: true,
        tableId: ORDERS_ID,
      },
    ]);
  });
});
