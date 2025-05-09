import { registerVisualization } from "metabase/visualizations";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { getInitialStateForMultipleSeries } from "./get-initial-state-for-multiple-series";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);

describe("getInitialVisualizerStateForMultipleSeries", () => {
  it("should handle multiple series cartesian charts", () => {
    const firstCard = createMockCard({
      id: 1,
      entity_id: createMockEntityId(),
      name: "First Series",
      display: "line",
      visualization_settings: {
        "graph.metrics": ["Revenue"],
        "graph.dimensions": ["Date"],
      },
    });

    const secondCard = createMockCard({
      id: 2,
      entity_id: createMockEntityId(),
      name: "Second Series",
      display: "line",
      visualization_settings: {
        "graph.metrics": ["Profit"],
        "graph.dimensions": ["Date"],
      },
    });

    const rawSeries = [
      createMockSingleSeries(firstCard, {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "Date" }),
            createMockColumn({ name: "Revenue" }),
          ],
        }),
      }),
      createMockSingleSeries(secondCard, {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "Date" }),
            createMockColumn({ name: "Profit" }),
          ],
        }),
      }),
    ];

    const initialState = getInitialStateForMultipleSeries(rawSeries);

    expect(initialState.columns).toHaveLength(4);
    expect(initialState.display).toBe("line");

    expect(initialState.columnValuesMapping).toEqual({
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "Date",
          sourceId: `card:${firstCard.entity_id}`,
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "Revenue",
          sourceId: `card:${firstCard.entity_id}`,
        },
      ],
      COLUMN_3: [
        {
          name: "COLUMN_3",
          originalName: "Date",
          sourceId: `card:${secondCard.entity_id}`,
        },
      ],
      COLUMN_4: [
        {
          name: "COLUMN_4",
          originalName: "Profit",
          sourceId: `card:${secondCard.entity_id}`,
        },
      ],
    });

    expect(initialState.settings).toMatchObject({
      "graph.metrics": ["COLUMN_2", "COLUMN_4"],
      "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
      "card.title": "First Series",
    });
  });
});
