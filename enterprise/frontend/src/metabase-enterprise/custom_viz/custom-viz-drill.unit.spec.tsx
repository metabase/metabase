import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { setup } from "metabase/query_builder/containers/test-utils";
import { getCard } from "metabase/query_builder/selectors";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types/visualization";
import type { CustomVizDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { registerMockCustomViz } from "./test-utils";

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

const CARD = createMockCard({
  id: 1,
  name: "Orders by month",
  type: "question",
  display: DISPLAY,
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

registerVisualizations();
registerMockCustomViz({ display: DISPLAY, Component: DemoVisualization });

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
    expect(card.display).toBe(DISPLAY);
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

    await drillFromCustomViz(/See these Orders/);

    await waitFor(() => {
      expect(checkNotNull(getCard(store.getState())).display).toBe("table");
    });
    expect(screen.queryByText("Custom viz rendered")).not.toBeInTheDocument();
  });
});
