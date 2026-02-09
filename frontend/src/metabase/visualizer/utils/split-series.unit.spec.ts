import registerVisualizations from "metabase/visualizations/register";
import type { RowValues } from "metabase-types/api/dataset";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { splitVisualizerSeries } from "./split-series";

registerVisualizations();

describe("splitVisualizerSeries", () => {
  it("should split a single series into multiple series", () => {
    const series = splitVisualizerSeries(
      [
        {
          card: createMockCard({
            display: "line",
            visualization_settings: {
              "graph.metrics": ["COLUMN_2", "COLUMN_3"],
              "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
            },
          }),
          data: createMockDatasetData({
            cols: [
              createMockColumn({ name: "COLUMN_1" }),
              createMockColumn({ name: "COLUMN_2" }),
              createMockColumn({ name: "COLUMN_3" }),
              createMockColumn({ name: "COLUMN_4" }),
            ],
            // todo make this more type safe
            // mergeVisualizerData can return undefined, which isn't a value RowValue
            // but it's the only way we can determine which rows to filter out when splitting
            rows: [
              ["2025-01-01", 1, 4, "2025-01-01"],
              ["2025-01-02", 2, 5, "2025-01-02"],
              ["2025-01-03", 3, undefined, undefined],
            ] as RowValues[],
            insights: [
              {
                col: "COLUMN_2",
                unit: "month",
                offset: 0,
                slope: 1,
                "last-change": 0,
                "last-value": 0,
                "previous-value": 0,
              },
              {
                col: "COLUMN_3",
                unit: "month",
                offset: 0,
                slope: 2,
                "last-change": 0,
                "last-value": 0,
                "previous-value": 0,
              },
            ],
          }),
        },
      ],
      {
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
      {},
    );
    expect(series).toHaveLength(2);
    const series1 = series[0];
    const series2 = series[1];
    expect(series1.data.cols.map((col) => col.name)).toEqual([
      "COLUMN_1",
      "COLUMN_2",
    ]);
    expect(series2.data.cols.map((col) => col.name)).toEqual([
      "COLUMN_3",
      "COLUMN_4",
    ]);
    expect(series1.data.rows).toEqual([
      ["2025-01-01", 1],
      ["2025-01-02", 2],
      ["2025-01-03", 3],
    ]);
    expect(series2.data.rows).toEqual([
      [4, "2025-01-01"],
      [5, "2025-01-02"],
    ]);
    expect(series1.data.insights?.map((insight) => insight.col)).toEqual([
      "COLUMN_2",
    ]);
    expect(series2.data.insights?.map((insight) => insight.col)).toEqual([
      "COLUMN_3",
    ]);
    expect(series1.columnValuesMapping).toBeDefined();
    expect(series2.columnValuesMapping).toBeDefined();
  });
});
