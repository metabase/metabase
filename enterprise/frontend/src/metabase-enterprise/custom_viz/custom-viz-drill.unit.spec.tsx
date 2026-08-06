import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { setup } from "metabase/query_builder/containers/test-utils";
import { getCard } from "metabase/query_builder/selectors";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualization } from "metabase/visualizations";
import type { VisualizationProps } from "metabase/visualizations/types/visualization";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import type { CustomVizDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockCustomVizPluginRuntime,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

const DISPLAY: CustomVizDisplayType = "custom:drill-demo-viz";

const CREATED_AT_COLUMN = createOrdersCreatedAtDatasetColumn({
  source: "breakout",
  unit: "month",
  field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
});

const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [CREATED_AT_COLUMN, COUNT_COLUMN],
    rows: [
      ["2026-01-01T00:00:00Z", 10],
      ["2026-02-01T00:00:00Z", 20],
    ],
  }),
});

const UNDERLYING_RECORDS_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createOrdersIdDatasetColumn(), createOrdersTotalDatasetColumn()],
    rows: [[1, 100]],
  }),
});

const CARD = createMockCard({
  id: 1,
  name: "Orders by month",
  description: "Count of orders bucketed by month",
  type: "question",
  display: DISPLAY,
  visualization_settings: {
    "card.title": "Orders by month",
    "custom.setting": "kept",
  },
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  },
});

function DemoVisualization({ onVisualizationClick }: VisualizationProps) {
  const [createdAt, count] = DATASET.data.rows[0];

  return (
    <div>
      <span>Custom viz rendered</span>
      <button
        type="button"
        onClick={(event) =>
          onVisualizationClick?.({
            value: count,
            column: COUNT_COLUMN,
            event: event.nativeEvent,
            element: event.currentTarget,
            data: [
              { col: CREATED_AT_COLUMN, value: createdAt },
              { col: COUNT_COLUMN, value: count },
            ],
            dimensions: [{ column: CREATED_AT_COLUMN, value: createdAt }],
          })
        }
      >
        Click me
      </button>
    </div>
  );
}

registerVisualization(Table);

registerVisualization(
  applyDefaultVisualizationProps(
    DemoVisualization,
    {
      id: DISPLAY,
      getName: () => "Drill demo viz",
      checkRenderable: () => undefined,
      mount: () => ({ update: () => undefined, unmount: () => undefined }),
      VisualizationComponent: () => null,
    },
    {
      identifier: DISPLAY,
      plugin: createMockCustomVizPluginRuntime(),
      getUiName: () => "Drill demo viz",
    },
  ),
);

async function drillFromCustomViz(actionName: RegExp) {
  expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Click me" }));

  const clickActions = await screen.findByTestId("click-actions-view");
  await userEvent.click(within(clickActions).getByText(actionName));
}

describe("query builder > custom visualization drill-through", () => {
  it("should keep the custom visualization selected after drilling (metabase#GDGT-2286)", async () => {
    const { store } = await setup({ card: CARD, dataset: DATASET });

    await drillFromCustomViz(/See this month by week/);

    expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();

    const card = checkNotNull(getCard(store.getState()));
    expect(card).toMatchObject({
      display: DISPLAY,
      name: CARD.name,
      description: CARD.description,
      type: CARD.type,
      visualization_settings: CARD.visualization_settings,
    });
    expect(card.dataset_query).toMatchObject({
      stages: [
        {
          breakout: [["field", { "temporal-unit": "week" }, ORDERS.CREATED_AT]],
        },
      ],
    });
  });

  it("should still switch to a table for the underlying records drill", async () => {
    const { store } = await setup({ card: CARD, dataset: DATASET });

    fetchMock.modifyRoute("dataset-post", {
      response: UNDERLYING_RECORDS_DATASET,
    });

    await drillFromCustomViz(/See these Orders/);

    await waitFor(() => {
      expect(checkNotNull(getCard(store.getState())).display).toBe("table");
    });
    expect(screen.queryByText("Custom viz rendered")).not.toBeInTheDocument();
  });
});
