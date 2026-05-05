import type { VisualizerVizDefinition } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getMissingColumnsFromVisualizationSettings } from "./utils";

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
