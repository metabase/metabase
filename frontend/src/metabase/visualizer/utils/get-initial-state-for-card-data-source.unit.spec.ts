import { registerVisualization } from "metabase/visualizations";
import Table from "metabase/visualizations/visualizations/Table/Table";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { getInitialStateForCardDataSource } from "./get-initial-state-for-card-data-source";

// Not registering all visualizations here for perf reasons
// @ts-expect-error -- TODO fix this error?
registerVisualization(Table);

describe("getInitialStateForCardDataSource", () => {
  const dashCard = createMockDashboardCard({
    card: createMockCard({
      display: "table",
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
    });
  });
});
