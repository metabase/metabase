import type { RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import type { MetricSourceId } from "../types/viewer-state";

import {
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupMeasureDefinition,
} from "./__tests__/test-helpers";
import { getSelectedMetricsInfo, splitByBreakout } from "./series";

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

      const result = splitByBreakout(series, 1);

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

      const result = splitByBreakout(series, 2);

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

      const result = splitByBreakout(series, 1);

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

    const result = splitByBreakout(series, 1);

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

    const result = splitByBreakout(series, 1, ["#509EE3", "#88BF4D"]);

    expect(result[0].card.visualization_settings.series_settings).toBeDefined();
    expect(result[1].card.visualization_settings.series_settings).toBeDefined();
  });

  it("returns original series when breakout values exceed MAX_SERIES", () => {
    const rows: RowValues[] = Array.from({ length: 102 }, (_, i) => [
      "2024-01",
      `Value ${i}`,
      i,
    ]);
    const series = createMockSingleSeries(CARD_OPTS, {
      data: { cols: [dimensionCol, breakoutCol, metricCol], rows },
    });

    const result = splitByBreakout(series, 1);

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

    const result = splitByBreakout(series, 1);

    expect(result[0].data.cols).toBe(result[1].data.cols);
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
