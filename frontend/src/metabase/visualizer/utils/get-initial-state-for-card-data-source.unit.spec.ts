import { registerVisualization } from "metabase/visualizations";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import Table from "metabase/visualizations/visualizations/Table/Table";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardCard,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import {
  getInitialStateForCardDataSource,
  getInitialVisualizerStateForMultipleSeries,
} from "./get-initial-state-for-card-data-source";

// Not registering all visualizations here for perf reasons
// @ts-expect-error -- TODO fix this error?
registerVisualization(Table);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);

describe("getInitialStateForCardDataSource", () => {
  const dashCard = createMockDashboardCard({
    card: createMockCard({
      display: "table",
      name: "TablyMcTableface",
      visualization_settings: {
        "table.cell_column": "avg",
        "table.pivot_column": "CATEGORY",
        "table.column_formatting": [],
      },
    }),
  });

  it("should not try to replace unknown columns in the settings", () => {
    const initialState = getInitialStateForCardDataSource(dashCard.card, [
      createMockColumn({ name: "Foo" }),
      createMockColumn({ name: "Bar" }),
    ]);

    expect(initialState.columns).toHaveLength(2);
    expect(initialState.columnValuesMapping).toEqual({
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "Foo",
          sourceId: "card:1",
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "Bar",
          sourceId: "card:1",
        },
      ],
    });

    expect(initialState.settings).toEqual({
      "table.cell_column": "avg",
      "table.pivot_column": "CATEGORY",
      "table.column_formatting": [],
      "card.title": "TablyMcTableface",
    });
  });
});

describe("getInitialVisualizerStateForMultipleSeries", () => {
  it("should handle multiple series cartesian charts", () => {
    const firstCard = createMockCard({
      id: 1,
      name: "First Series",
      display: "line",
      visualization_settings: {
        "graph.metrics": ["Revenue"],
        "graph.dimensions": ["Date"],
      },
    });

    const secondCard = createMockCard({
      id: 2,
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

    const initialState = getInitialVisualizerStateForMultipleSeries(rawSeries);

    expect(initialState.columns).toHaveLength(4);
    expect(initialState.display).toBe("line");

    expect(initialState.columnValuesMapping).toEqual({
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "Date",
          sourceId: "card:1",
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "Revenue",
          sourceId: "card:1",
        },
      ],
      COLUMN_3: [
        {
          name: "COLUMN_3",
          originalName: "Date",
          sourceId: "card:2",
        },
      ],
      COLUMN_4: [
        {
          name: "COLUMN_4",
          originalName: "Profit",
          sourceId: "card:2",
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
