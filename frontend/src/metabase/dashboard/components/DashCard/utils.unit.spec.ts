import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { VisualizerVizDefinition } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  getMetricSeriesWithDefaultDisplay,
  getMissingColumnsFromVisualizationSettings,
} from "./utils";

describe("getMetricSeriesWithDefaultDisplay", () => {
  function createMetricSeries(query: Lib.Query) {
    return createMockSingleSeries(
      createMockCard({ type: "metric", display: "line" }),
      createMockDataset({ json_query: Lib.toJsQuery(query) }),
    );
  }

  it("uses a bar chart for a metric with a binned numeric breakout", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "TOTAL",
              sourceName: "ORDERS",
              bins: 10,
            },
          ],
        },
      ],
    });

    const result = getMetricSeriesWithDefaultDisplay(
      [createMetricSeries(query)],
      SAMPLE_METADATA,
    );

    expect(result[0].card.display).toBe("bar");
  });

  it("uses a line chart for a metric with a temporal breakout", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
          ],
        },
      ],
    });

    const result = getMetricSeriesWithDefaultDisplay(
      [createMetricSeries(query)],
      SAMPLE_METADATA,
    );

    expect(result[0].card.display).toBe("line");
  });

  it("preserves the display of regular questions", () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ type: "question", display: "line" }),
        createMockDataset(),
      ),
    ];

    expect(getMetricSeriesWithDefaultDisplay(series, SAMPLE_METADATA)).toBe(
      series,
    );
  });
});

describe("getMissingColumnsFromVisualizationSettings", () => {
  const createMockSeriesWithCols = (cardId: number, cols: string[]) => [
    createMockSingleSeries(
      createMockCard({ id: cardId }),
      createMockDataset({
        data: createMockDatasetData({
          cols: cols.map((name) => createMockColumn({ name })),
        }),
      }),
    ),
  ];

  it("returns an empty array when visualizerEntity is undefined", () => {
    const result = getMissingColumnsFromVisualizationSettings({
      visualizerEntity: undefined,
      rawSeries: [],
    });
    expect(result).toEqual([]);
  });

  it("returns an empty array when rawSeries is empty", () => {
    const result = getMissingColumnsFromVisualizationSettings({
      visualizerEntity: {
        columnValuesMapping: {},
        display: "bar",
        settings: {},
      },
      rawSeries: [],
    });
    expect(result).toEqual([]);
  });

  it("returns missing columns based on columnValuesMapping", () => {
    const visualizerEntity: VisualizerVizDefinition = {
      columnValuesMapping: {
        col1: [{ sourceId: "card:1", originalName: "col1", name: "col1" }],
        col2: [{ sourceId: "card:2", originalName: "col2", name: "col2" }],
      },
      display: "bar",
      settings: {},
    };

    const rawSeries = [
      ...createMockSeriesWithCols(1, ["col1"]),
      ...createMockSeriesWithCols(2, ["col3"]),
    ];

    const result = getMissingColumnsFromVisualizationSettings({
      visualizerEntity,
      rawSeries,
    });

    expect(result).toEqual([
      [{ sourceId: "card:2", originalName: "col2", name: "col2" }],
    ]);
  });

  it("handles missing series gracefully", () => {
    const visualizerEntity: VisualizerVizDefinition = {
      columnValuesMapping: {
        col1: [{ sourceId: "card:1", originalName: "col1", name: "col1" }],
        col2: [{ sourceId: "card:2", originalName: "col2", name: "col2" }],
      },
      display: "bar",
      settings: {},
    };

    const rawSeries = createMockSeriesWithCols(1, ["col1"]);

    const result = getMissingColumnsFromVisualizationSettings({
      visualizerEntity,
      rawSeries,
    });

    expect(result).toEqual([
      [{ sourceId: "card:2", originalName: "col2", name: "col2" }],
    ]);
  });
});
