import type {
  MetricBreakoutValuesResponse,
  RowValues,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import type { ExpressionDimensionItem } from "../components/DimensionPillBar";
import type {
  BreakoutColorMap,
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "../types/viewer-state";

import {
  GEO_METRIC,
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupDefinitionWithBreakout,
  setupMeasureDefinition,
} from "./__tests__/test-helpers";
import {
  type SplitByBreakoutParams,
  buildDimensionItemsFromDefinitions,
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

const METRIC_ENTITY: MetricsViewerFormulaEntity = {
  id: "metric:1" as MetricSourceId,
  type: "metric",
  definition: null,
};

type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

function callSplitByBreakout({
  entity = METRIC_ENTITY,
  series,
  breakoutColorMap,
  isFirstSeries = true,
  hasMultipleSeries = false,
  display = "line",
  definitions = {},
}: OptionalKeys<
  SplitByBreakoutParams,
  "entity" | "isFirstSeries" | "hasMultipleSeries" | "display" | "definitions"
>) {
  return splitByBreakout({
    entity,
    series,
    breakoutColorMap,
    isFirstSeries,
    hasMultipleSeries,
    display,
    definitions,
  });
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

      const { series: result } = callSplitByBreakout({
        series,
        breakoutColorMap: makeColorMap(["Gadgets", "Widgets"]),
      });

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["2024-01", 10],
        ["2024-02", 30],
      ]);

      expect(result[1].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[1].data.rows).toEqual([
        ["2024-01", 20],
        ["2024-02", 40],
      ]);
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

      const { series: result } = callSplitByBreakout({
        series,
        breakoutColorMap: makeColorMap(["Gadgets", "Widgets"]),
      });

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["Gadgets", 10],
        ["Gadgets", 30],
      ]);

      expect(result[1].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[1].data.rows).toEqual([["Widgets", 20]]);
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

    const { series: result } = callSplitByBreakout({
      series,
      breakoutColorMap: makeColorMap(["Gadgets", "Widgets"]),
    });

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

    const { series: result } = callSplitByBreakout({
      series,
      breakoutColorMap: makeColorMap(["Gadgets", "Widgets"]),
    });

    expect(result[0].card.visualization_settings.series_settings).toBeDefined();
    expect(result[1].card.visualization_settings.series_settings).toBeDefined();
  });

  it("returns original series when breakout values exceed MAX_SERIES", () => {
    const values = Array.from({ length: 102 }, (_, i) => `Value ${i}`);
    const rows: RowValues[] = values.map((v, i) => ["2024-01", v, i]);
    const series = createMockSingleSeries(CARD_OPTS, {
      data: { cols: [dimensionCol, breakoutCol, metricCol], rows },
    });

    const { series: result } = callSplitByBreakout({
      series,
      breakoutColorMap: makeColorMap(values),
    });

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

    const { series: result } = callSplitByBreakout({
      series,
      breakoutColorMap: makeColorMap(["Gadgets", "Widgets"]),
    });

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

    const { series: result, activeBreakoutColorMap } = callSplitByBreakout({
      series,
      breakoutColorMap: colorMap,
    });

    expect(result).toHaveLength(1);
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

    const breakoutColorMap: BreakoutColorMap = new Map([
      ["Gadgets", "#509EE3"],
      ["Widgets", "#88BF4D"],
    ]);

    const { series: result } = callSplitByBreakout({
      series,
      breakoutColorMap,
    });

    expect(result).toHaveLength(2);
    // series order follows colorMap iteration order, not data order
    expect(result[0].data.rows[0][1]).toBe(10);
    expect(result[1].data.rows[0][1]).toBe(20);

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
  it("returns empty object for empty formula entities", () => {
    expect(computeSourceBreakoutColors([], {})).toEqual({});
  });

  it("returns a string color for a definition without breakout", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;

    const result = computeSourceBreakoutColors(
      [{ id: sourceId, type: "metric" as const, definition }],
      { [sourceId]: { id: sourceId, definition } },
    );

    expect(typeof result[0]).toBe("string");
  });

  it("returns a Map for a definition with breakout and breakout values", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );
    const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;

    const breakoutValues = new Map<number, MetricBreakoutValuesResponse>([
      [
        0,
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
      [{ id: sourceId, type: "metric" as const, definition }],
      { [sourceId]: { id: sourceId, definition } },
      breakoutValues,
    );

    expect(result[0]).toBeInstanceOf(Map);
    const colorMap = result[0] as Map<string, string>;
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
    const sourceId1: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
    const sourceId2: MetricSourceId = `metric:${REVENUE_METRIC.id}`;

    const breakoutValues = new Map<number, MetricBreakoutValuesResponse>([
      [
        0,
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
        { id: sourceId1, type: "metric" as const, definition: withBreakout },
        {
          id: sourceId2,
          type: "metric" as const,
          definition: withoutBreakout,
        },
      ],
      {
        [sourceId1]: { id: sourceId1, definition: withBreakout },
        [sourceId2]: { id: sourceId2, definition: withoutBreakout },
      },
      breakoutValues,
    );

    expect(result[0]).toBeInstanceOf(Map);
    expect(typeof result[1]).toBe("string");
  });

  it("falls back to string when breakout definition has no breakout values", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinitionWithBreakout(
      metadata,
      REVENUE_METRIC.id,
      1,
    );
    const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;

    const result = computeSourceBreakoutColors(
      [{ id: sourceId, type: "metric" as const, definition }],
      { [sourceId]: { id: sourceId, definition } },
      new Map(),
    );

    expect(typeof result[0]).toBe("string");
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
    it("extracts measure id, name, and sourceType", () => {
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
      },
    ]);
  });
});

describe("buildDimensionItemsFromDefinitions", () => {
  const revenueMetadata = createMetricMetadata([REVENUE_METRIC]);
  const revenueDefinition = setupDefinition(revenueMetadata, REVENUE_METRIC.id);
  const revenueSourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
  const revenueProjected = setupDefinitionWithBreakout(
    revenueMetadata,
    REVENUE_METRIC.id,
    0,
  );
  const geoMetadata = createMetricMetadata([GEO_METRIC]);
  const geoDefinition = setupDefinition(geoMetadata, GEO_METRIC.id);
  const geoSourceId: MetricSourceId = `metric:${GEO_METRIC.id}`;
  const definitions = {
    [revenueSourceId]: {
      id: revenueSourceId,
      definition: revenueDefinition,
    },
    [geoSourceId]: {
      id: geoSourceId,
      definition: geoDefinition,
    },
  };
  const emptyProjectionConfig = {};

  describe("standalone metric entities", () => {
    it("produces a metric item with label when a dimension is selected", () => {
      const dimensionMapping = { 0: "dim-created-at" };
      const modifiedDefinitionsBySlotIndex = new Map([[0, revenueProjected]]);
      const sourceColors = { 0: ["#509EE3"] };
      const metricSlots = [
        { slotIndex: 0, entityIndex: 0, sourceId: revenueSourceId },
      ];
      const formulaEntities: MetricsViewerFormulaEntity[] = [
        {
          id: revenueSourceId,
          type: "metric",
          definition: revenueDefinition,
        },
      ];
      const items = buildDimensionItemsFromDefinitions(
        definitions,
        dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        emptyProjectionConfig,
      );

      expect(items).toHaveLength(1);
      expect(items[0].type).toBe("metric");
      expect(items[0].label).toBe("Created At");
      expect(items[0].icon).toBeDefined();
    });
  });

  describe("expression entities", () => {
    const formulaEntities: MetricsViewerFormulaEntity[] = [
      {
        id: "expression:test",
        type: "expression",
        name: "Test Expression",
        tokens: [
          {
            type: "metric",
            sourceId: revenueSourceId,
            count: 1,
          },
          {
            type: "operator",
            op: "+",
          },
          {
            type: "metric",
            sourceId: geoSourceId,
            count: 1,
          },
        ],
      },
    ];
    const sourceColors = { 0: ["#509EE3"] };
    const metricSlots = [
      { slotIndex: 0, entityIndex: 0, sourceId: revenueSourceId },
      { slotIndex: 1, entityIndex: 0, sourceId: geoSourceId },
    ];
    // modifiedDefinitionsBySlotIndex is not used for expressions
    // which could be cleaned up. why do we call getModifiedDefinition in buildExpressionMetricSources when we have the modified definitions already?
    const modifiedDefinitionsBySlotIndex = new Map();

    it("shows a unified label when the dimensions are the same", () => {
      const dimensionMapping = { 0: "dim-created-at", 1: "dim-created-at" };

      const items = buildDimensionItemsFromDefinitions(
        definitions,
        dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        emptyProjectionConfig,
      );

      expect(items).toHaveLength(1);
      const expressionItem = items[0] as ExpressionDimensionItem;
      expect(expressionItem.type).toBe("expression");
      expect(expressionItem.label).toBe("Created At");
      expect(expressionItem.icon).toBeDefined();
      expect(expressionItem.metricSources).toHaveLength(2);
    });

    it("shows 'multiple dimensions' label when the dimensions are different", () => {
      const dimensionMapping = { 0: "dim-category", 1: "dim-created-at" };

      const items = buildDimensionItemsFromDefinitions(
        definitions,
        dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        emptyProjectionConfig,
      );

      expect(items).toHaveLength(1);
      const expressionItem = items[0] as ExpressionDimensionItem;
      expect(expressionItem.type).toBe("expression");
      expect(expressionItem.label).toBe("Multiple dimensions");
      expect(expressionItem.icon).toBeUndefined();
      expect(expressionItem.metricSources).toHaveLength(2);
    });
  });
});
