import { NumberColumn, StringColumn } from "__support__/visualizations";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";

import { mergeVisualizerData } from "./merge-data";

describe("mergeVisualizerData", () => {
  it("should combine datasets into a single series", () => {
    const result = mergeVisualizerData({
      columns: [
        createMockColumn(StringColumn({ name: "COLUMN_1" })),
        createMockColumn(NumberColumn({ name: "COLUMN_2" })),
        createMockColumn(NumberColumn({ name: "COLUMN_3" })),
        createMockColumn(StringColumn({ name: "COLUMN_4" })),
      ],
      columnValuesMapping: {
        COLUMN_1: [
          {
            sourceId: "card:1",
            originalName: "CREATED_AT",
            name: "COLUMN_1",
          },
        ],
        COLUMN_2: [
          {
            sourceId: "card:1",
            originalName: "count",
            name: "COLUMN_2",
          },
        ],
        COLUMN_3: [
          {
            sourceId: "card:2",
            originalName: "count",
            name: "COLUMN_3",
          },
        ],
        COLUMN_4: [
          {
            sourceId: "card:2",
            originalName: "CREATED_AT",
            name: "COLUMN_4",
          },
        ],
      },
      datasets: {
        "card:1": createMockDataset({
          data: {
            cols: [
              createMockColumn(StringColumn({ name: "CREATED_AT" })),
              createMockColumn(NumberColumn({ name: "count" })),
            ],
            rows: [
              ["2025-01-01", 1],
              ["2025-01-02", 2],
              ["2025-01-03", 3],
            ],
            insights: [
              {
                col: "count",
                unit: "month",
                offset: 0,
                slope: 1,
                "last-change": 0,
                "last-value": 0,
                "previous-value": 0,
              },
            ],
          },
        }),
        "card:2": createMockDataset({
          data: {
            cols: [
              createMockColumn(NumberColumn({ name: "count" })),
              createMockColumn(StringColumn({ name: "CREATED_AT" })),
            ],
            rows: [
              [4, "2025-01-01"],
              [5, "2025-01-02"],
            ],
            insights: [
              {
                col: "count",
                unit: "month",
                offset: 0,
                slope: 2,
                "last-change": 0,
                "last-value": 0,
                "previous-value": 0,
              },
            ],
          },
        }),
      },
      dataSources: [
        {
          id: "card:1",
          sourceId: 1,
          type: "card",
          name: "Chart 1",
        },
        {
          id: "card:2",
          sourceId: 2,
          type: "card",
          name: "Chart 2",
        },
      ],
    });

    expect(result.rows).toEqual([
      ["2025-01-01", 1, 4, "2025-01-01"],
      ["2025-01-02", 2, 5, "2025-01-02"],
      ["2025-01-03", 3, undefined, undefined],
    ]);

    expect(result.insights.map((insight) => insight.col)).toEqual([
      "COLUMN_2",
      "COLUMN_3",
    ]);
  });
});
