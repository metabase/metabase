import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Visualization,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { registerVisualization } from "metabase/viz-core";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { CustomVizDisplayType, DatasetData } from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
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

import { getCard } from "../store/selectors";

import { setup } from "./test-utils";

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

const CATEGORY_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockCategoryColumn({
        name: "CATEGORY",
        display_name: "Category",
        source: "breakout",
      }),
      COUNT_COLUMN,
    ],
    rows: [
      ["Doohickey", 10],
      ["Gadget", 20],
    ],
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

registerVisualizations();

// A stand-in for a plugin-backed visualization. The query builder only needs a
// registered `custom:` display it can render and check, so the spec builds one
// here rather than reaching into the enterprise custom viz module.
const DemoViz = Object.assign(DemoVisualization, {
  identifier: DISPLAY,
  getUiName: () => "Drill demo viz",
  settings: {},
  checkRenderable: ([{ data }]: { data?: DatasetData }[]) => {
    if (!data?.cols.some(isDate)) {
      throw new Error("Needs a date column");
    }
  },
  noHeader: false,
  canSavePng: false,
  hidden: false,
});

// A Visualization is a component carrying static props, and Object.assign types
// that intersection loosely, so the target is named explicitly.
registerVisualization(DemoViz as unknown as Visualization);

async function drillFromCustomViz(actionName: RegExp) {
  expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Click me" }));

  const clickActions = await screen.findByTestId("click-actions-view");
  await userEvent.click(within(clickActions).getByText(actionName));
}

async function expectFallbackChart() {
  expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
  expect(screen.queryByText("Custom viz rendered")).not.toBeInTheDocument();
}

describe("query builder > custom visualization drill-through", () => {
  it("should keep the custom visualization selected after drilling (metabase#GDGT-2286)", async () => {
    const { store } = await setup({ card: CARD, dataset: DATASET });

    await drillFromCustomViz(/See this month by week/);

    expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();

    const card = checkNotNull(getCard(store.getState()));
    expect(card.display).toBe(DISPLAY);
  });

  it("should switch away from a custom visualization that cannot render the drilled data, and back again when navigating back and forth (metabase#GDGT-2218)", async () => {
    const { router } = await setup({ card: CARD, dataset: DATASET });

    // the drilled query comes back without a date column, so the custom
    // visualization can no longer render it
    fetchMock.modifyRoute("dataset-post", { response: CATEGORY_DATASET });

    await drillFromCustomViz(/See this month by week/);

    await expectFallbackChart();

    act(() => router.back());

    expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();

    act(() => router.forward());

    await expectFallbackChart();
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
