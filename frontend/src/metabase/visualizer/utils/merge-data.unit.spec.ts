import { NumberColumn, StringColumn } from "__support__/visualizations";
import { createMockColumn } from "metabase-types/api/mocks";

import { mergeVisualizerData } from "./merge-data";

describe("mergeData", () => {
  // [VIZ-659: Visualizer dashcards flash "no results" > one chart > different chart]
  // (https://linear.app/metabase/issue/VIZ-659
  it("should return undefined when data is loading (VIZ-659)", () => {
    const result = mergeVisualizerData({
      columns: [
        createMockColumn(StringColumn({ name: "COLUMN_1" })),
        createMockColumn(NumberColumn({ name: "COLUMN_2" })),
      ],
      columnValuesMapping: {
        COLUMN_1: [
          {
            sourceId: "card:73",
            originalName: "RATING",
            name: "COLUMN_1",
          },
        ],
        COLUMN_2: [
          {
            sourceId: "card:73",
            originalName: "count",
            name: "COLUMN_2",
          },
        ],
      },
      datasets: {},
      dataSources: [
        {
          id: "card:73",
          sourceId: 73,
          type: "card",
          name: "bar chart yo",
        },
      ],
    });

    expect(result).toBeUndefined();
  });
});
