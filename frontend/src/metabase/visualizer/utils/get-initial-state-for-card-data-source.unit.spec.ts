import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart/BarChart";
import { Funnel } from "metabase/visualizations/visualizations/Funnel";
import { Scalar } from "metabase/visualizations/visualizations/Scalar";
import Table from "metabase/visualizations/visualizations/Table/Table";
import type { CardDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getInitialStateForCardDataSource } from "./get-initial-state-for-card-data-source";

// Not registering all visualizations here for perf reasons
// @ts-expect-error -- TODO fix this error?
registerVisualization(Table);
// @ts-expect-error -- TODO fix this error?
registerVisualization(BarChart);
// @ts-expect-error -- TODO fix this error?
registerVisualization(Scalar);

// @ts-expect-error -- TODO fix this error?
registerVisualization(Funnel);

describe("getInitialStateForCardDataSource", () => {
  const dashCard = createMockDashboardCard({
    card: createMockCard({
      display: "smartscalar",
      name: "ScalarMcSmartface",
      visualization_settings: {
        "scalar.compact_primary_number": true,
      },
    }),
  });

  const dataset = createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockNumericColumn({ name: "Foo" }),
        createMockColumn({ name: "Bar" }),
      ],
    }),
  });

  it("should pick the proper display if it is not supported by the visualizer", () => {
    const initialState = getInitialStateForCardDataSource(
      dashCard.card,
      dataset,
    );

    expect(initialState.display).toEqual("bar");
  });

  it("should ignore superfluous columns (VIZ-1035)", () => {
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "CREATED_AT",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            semantic_type: null,
            unit: "month",
          }),
          createMockColumn({
            name: "SOME_METRIC",
            database_type: "int8",
            semantic_type: "type/Quantity",
            base_type: "type/BigInteger",
          }),
          createMockColumn({
            name: "SOME_OTHER_METRIC",
            database_type: "int8",
            semantic_type: "type/Quantity",
            base_type: "type/BigInteger",
          }),
        ],
      }),
    });

    const card = createMockCard({
      display: "table",
      name: "TablyMcTableface",
      visualization_settings: {},
    });

    const state = getInitialStateForCardDataSource(card, dataset);

    expect(state.columnValuesMapping).toEqual({
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "CREATED_AT",
          sourceId: "card:1",
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "SOME_METRIC",
          sourceId: "card:1",
        },
      ],
    });

    expect(state.settings).toEqual({
      "card.title": "TablyMcTableface",
      "graph.dimensions": ["COLUMN_1"],
      "graph.metrics": ["COLUMN_2"],
    });
  });

  it("should compute default viz settings when card's viz type isn't supported by the visualizer", () => {
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "CREATED_AT",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            semantic_type: null,
            unit: "month",
          }),
          createMockColumn({
            name: "SOME_METRIC",
            base_type: "type/Integer",
            effective_type: "type/Integer",
            semantic_type: null,
          }),
        ],
      }),
    });

    const state = getInitialStateForCardDataSource(dashCard.card, dataset);

    expect(state.columnValuesMapping).toEqual({
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "CREATED_AT",
          sourceId: "card:1",
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "SOME_METRIC",
          sourceId: "card:1",
        },
      ],
    });

    expect(state.settings).toEqual({
      "card.title": "ScalarMcSmartface",
      "graph.dimensions": ["COLUMN_1"],
      "graph.metrics": ["COLUMN_2"],
      "scalar.compact_primary_number": true,
    });
  });

  it.each<CardDisplayType>(["scalar", "gauge"])(
    "should return scalar funnel initial state if the original card is a %s",
    (vizType) => {
      const card = createMockCard({
        name: `${vizType} card`,
        display: vizType,
      });
      const initialState = getInitialStateForCardDataSource(card, dataset);

      expect(initialState).toEqual({
        display: "funnel",
        columns: [
          {
            name: "METRIC",
            display_name: "METRIC",
            base_type: "type/Integer",
            effective_type: "type/Integer",
            field_ref: ["field", "METRIC", { "base-type": "type/Integer" }],
            source: "artificial",
          },
          {
            name: "DIMENSION",
            display_name: "DIMENSION",
            base_type: "type/Text",
            effective_type: "type/Text",
            field_ref: ["field", "DIMENSION", { "base-type": "type/Text" }],
            source: "artificial",
          },
        ],
        columnValuesMapping: {
          METRIC: [
            {
              name: "COLUMN_1",
              originalName: "Foo",
              sourceId: "card:1",
            },
          ],
          DIMENSION: ["$_card:1_name"],
        },
        settings: {
          "card.title": card.name,
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      });
    },
  );
});
