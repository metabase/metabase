import userEvent from "@testing-library/user-event";
import { getInstanceByDom } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import { act, fireEvent, screen, waitFor, within } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  Card,
  CardQueryMetadata,
  Dataset,
  DatasetData,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { TEST_DB, setup } from "./test-utils";

const SCALAR_METRIC = createMockCard({
  id: 2,
  name: "Count of orders",
  type: "metric",
  display: "scalar",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  ),
});

const TIMESERIES_METRIC = createMockCard({
  id: 3,
  name: "Count of orders over time",
  type: "metric",
  display: "line",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        },
      ],
    }),
  ),
});

const METRIC_PROVIDER = createMetadataProvider({
  metadata: createMockMetadata({
    databases: [TEST_DB],
    questions: [SCALAR_METRIC, TIMESERIES_METRIC],
  }),
});

const QUESTION_WITH_SCALAR_METRIC = createMockCard({
  id: 1,
  name: "Question with metric",
  type: "question",
  display: "scalar",
  database_id: SAMPLE_DB_ID,
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(METRIC_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "metric", id: SCALAR_METRIC.id }],
        },
      ],
    }),
  ),
});

const QUESTION_WITH_TIMESERIES_METRIC = createMockCard({
  ...QUESTION_WITH_SCALAR_METRIC,
  display: "line",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(METRIC_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "metric", id: TIMESERIES_METRIC.id }],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        },
      ],
    }),
  ),
});

const metricClause = (metricId: number) => [
  "metric",
  expect.anything(),
  metricId,
];

const FILTERED_BY_GADGET_STAGE = {
  aggregation: [metricClause(SCALAR_METRIC.id)],
  filters: [
    [
      "=",
      {},
      [
        "field",
        expect.objectContaining({ "source-field": ORDERS.PRODUCT_ID }),
        PRODUCTS.CATEGORY,
      ],
      "Gadget",
    ],
  ],
};

const CREATED_AT_MONTH_BREAKOUT = [
  "field",
  expect.objectContaining({ "temporal-unit": "month" }),
  ORDERS.CREATED_AT,
];

const EXPRESSION_STAGE = {
  aggregation: [
    [
      "*",
      expect.objectContaining({ name: "Expression" }),
      metricClause(TIMESERIES_METRIC.id),
      2,
    ],
  ],
  breakout: [CREATED_AT_MONTH_BREAKOUT],
};

const CREATED_AT_YEAR_STAGE = {
  aggregation: [metricClause(TIMESERIES_METRIC.id)],
  breakout: [
    [
      "field",
      expect.objectContaining({ "temporal-unit": "year" }),
      ORDERS.CREATED_AT,
    ],
  ],
};

const PRODUCT_CATEGORY_STAGE = {
  aggregation: [metricClause(TIMESERIES_METRIC.id)],
  breakout: [
    [
      "field",
      expect.objectContaining({ "source-field": ORDERS.PRODUCT_ID }),
      PRODUCTS.CATEGORY,
    ],
  ],
};

const DRILL_POINT = "2026-02-01T00:00:00Z";

const BREAK_OUT_BY_SOURCE_STAGE = {
  aggregation: [metricClause(TIMESERIES_METRIC.id)],
  // The chart reports the clicked month in the report time zone, without an offset.
  filters: [["=", {}, CREATED_AT_MONTH_BREAKOUT, "2026-02-01T00:00:00"]],
  breakout: [
    [
      "field",
      expect.objectContaining({ "source-field": ORDERS.USER_ID }),
      PEOPLE.SOURCE,
    ],
  ],
};

const EMPTY_DATASET = createMockDataset({
  data: createMockDatasetData({ rows: [], cols: [] }),
});

function createMetricMetadata(metric: Card): CardQueryMetadata {
  // The response also carries the metric card, which the type leaves out.
  return Object.assign(createMockCardQueryMetadata({ databases: [TEST_DB] }), {
    cards: [metric],
  });
}

function createAggregationColumn(name: string, displayName: string) {
  return createMockColumn({
    name,
    display_name: displayName,
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/Quantity",
    source: "aggregation",
    field_ref: ["aggregation", 0],
  });
}

function createResultDataset({
  cols,
  rows,
}: Pick<DatasetData, "cols" | "rows">): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

function removeUuids(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUuids);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, item]) => [key, removeUuids(item)]),
    );
  }
  return value;
}

function getRequestBody(call: CallLog): unknown {
  const body: unknown = JSON.parse(String(call.options.body));
  return removeUuids(body);
}

function hasSingleStage(body: unknown, stage: object): boolean {
  try {
    expect(body).toMatchObject({ stages: [stage] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stands in for POST /api/dataset: it returns the rows only for a query whose
 * single stage matches `stage`, and no rows for any other query.
 */
function setupDatasetForStage(stage: object, dataset: Dataset) {
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) =>
      hasSingleStage(getRequestBody(call), stage) ? dataset : EMPTY_DATASET,
  });
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}

async function waitForDatasetRequest(previousCount: number) {
  await waitFor(() =>
    expect(getDatasetCalls()).toHaveLength(previousCount + 1),
  );
  return getRequestBody(getDatasetCalls()[previousCount]);
}

async function visualize() {
  const previousCount = getDatasetCalls().length;
  await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
  return waitForDatasetRequest(previousCount);
}

const CREATED_AT_COLUMN = createOrdersCreatedAtDatasetColumn({
  display_name: "Created At: Month",
  source: "breakout",
  unit: "month",
  field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
});

const TIMESERIES_METRIC_COLUMN = createAggregationColumn(
  "count",
  "Count of orders over time",
);

const DRILL_COUNT = 20;

const TIMESERIES_DATASET = createResultDataset({
  cols: [CREATED_AT_COLUMN, TIMESERIES_METRIC_COLUMN],
  rows: [
    ["2026-01-01T00:00:00Z", 10],
    [DRILL_POINT, DRILL_COUNT],
    ["2026-03-01T00:00:00Z", 30],
  ],
});

async function findChart() {
  return screen.findByTestId("chart-container");
}

async function waitForChartText(text: string) {
  await waitFor(async () =>
    expect(within(await findChart()).getByText(text)).toBeInTheDocument(),
  );
}

/**
 * Clicks a point of the rendered line chart. jsdom has no layout, so the
 * point's position comes from the chart itself.
 */
async function clickChartPoint(point: [string, number]) {
  const chart = await findChart();
  const instance = checkNotNull(getInstanceByDom(chart));
  const position = instance.convertToPixel({ seriesIndex: 0 }, point);
  if (!Array.isArray(position)) {
    throw new Error("The chart did not return the position of the point");
  }
  const [clientX, clientY] = position;
  const root = instance.getZr().painter.getViewportRoot();
  fireEvent.mouseMove(root, { clientX, clientY });
  fireEvent.mouseDown(root, { clientX, clientY });
  fireEvent.mouseUp(root, { clientX, clientY });
  fireEvent.click(root, { clientX, clientY });
}

registerVisualizations();

describe("query builder > metrics in questions", () => {
  it("should show the loading page until the question metadata is loaded (metabase#47058)", async () => {
    const metadata = defer<CardQueryMetadata>();
    fetchMock.get(
      `path:/api/card/${QUESTION_WITH_SCALAR_METRIC.id}/query_metadata`,
      () => metadata.promise,
    );

    await setup({
      card: QUESTION_WITH_SCALAR_METRIC,
      initialRoute: `/question/${QUESTION_WITH_SCALAR_METRIC.id}/notebook`,
      waitForLoad: false,
    });

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("step-summarize-0-0")).not.toBeInTheDocument();

    await act(async () => {
      metadata.resolve(createMetricMetadata(SCALAR_METRIC));
    });

    const step = await screen.findByTestId("step-summarize-0-0");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("[Unknown Metric]")).not.toBeInTheDocument();
    expect(within(step).getByText("Count of orders")).toBeInTheDocument();
  });

  it("should be able to add a filter to a question that uses a metric", async () => {
    setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);
    await setup({
      card: QUESTION_WITH_SCALAR_METRIC,
      initialRoute: `/question/${QUESTION_WITH_SCALAR_METRIC.id}/notebook`,
      metadata: createMetricMetadata(SCALAR_METRIC),
    });
    setupDatasetForStage(
      FILTERED_BY_GADGET_STAGE,
      createResultDataset({
        cols: [createAggregationColumn("count", "Count of orders")],
        rows: [[4939]],
      }),
    );

    await userEvent.click(
      within(screen.getByTestId("step-data-0-0")).getByRole("button", {
        name: "Filter",
      }),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(within(popover).getByText("Product"));
    await userEvent.click(await within(popover).findByText("Category"));
    await userEvent.click(await within(popover).findByText("Gadget"));
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );
    const body = await visualize();

    expect(body).toMatchObject({ stages: [FILTERED_BY_GADGET_STAGE] });
    expect(
      await within(await screen.findByTestId("scalar-container")).findByText(
        "4,939",
      ),
    ).toBeInTheDocument();
  });

  it("should be able to add a custom aggregation expression based on a metric", async () => {
    await setup({
      card: QUESTION_WITH_TIMESERIES_METRIC,
      initialRoute: `/question/${QUESTION_WITH_TIMESERIES_METRIC.id}/notebook`,
      metadata: createMetricMetadata(TIMESERIES_METRIC),
    });
    setupDatasetForStage(
      EXPRESSION_STAGE,
      createResultDataset({
        cols: [
          CREATED_AT_COLUMN,
          createAggregationColumn("Expression", "Expression"),
        ],
        rows: [
          ["2026-01-01T00:00:00Z", 20],
          [DRILL_POINT, 40],
        ],
      }),
    );

    await userEvent.click(
      within(screen.getByTestId("step-summarize-0-0")).getByText(
        "Count of orders over time",
      ),
    );
    const editor = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.clear(editor);
    await userEvent.type(editor, "[[Count of orders over time] * 2");
    await act(async () => {
      editor.blur();
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Auto-format" }),
    );
    const nameInput = screen.getByTestId("expression-name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Expression");
    const updateButton = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateButton).toBeEnabled());
    await userEvent.click(updateButton);
    const body = await visualize();

    expect(body).toMatchObject({ stages: [EXPRESSION_STAGE] });
    expect(
      await screen.findByText("Expression by Created At: Month"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Showing 2 rows")).toBeInTheDocument();
    await waitForChartText("Expression");
  });

  it("should be able to change the temporal unit and then replace the breakout when consuming a timeseries metric", async () => {
    await setup({
      card: QUESTION_WITH_TIMESERIES_METRIC,
      initialRoute: `/question/${QUESTION_WITH_TIMESERIES_METRIC.id}/notebook`,
      metadata: createMetricMetadata(TIMESERIES_METRIC),
    });
    setupDatasetForStage(
      CREATED_AT_YEAR_STAGE,
      createResultDataset({
        cols: [
          createOrdersCreatedAtDatasetColumn({ unit: "year" }),
          TIMESERIES_METRIC_COLUMN,
        ],
        rows: [
          ["2022-01-01T00:00:00Z", 744],
          ["2023-01-01T00:00:00Z", 2950],
          ["2024-01-01T00:00:00Z", 4904],
          ["2025-01-01T00:00:00Z", 6578],
          ["2026-01-01T00:00:00Z", 3584],
        ],
      }),
    );

    await userEvent.click(
      within(screen.getByTestId("breakout-step")).getByText(
        "Created At: Month",
      ),
    );
    const option = await screen.findByRole("option", { name: "Created At" });
    const bucketButton = within(option).getByLabelText("Temporal bucket");
    expect(bucketButton).toHaveTextContent("by month");
    await userEvent.click(bucketButton);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Year" }),
    );
    const yearBody = await visualize();

    expect(yearBody).toMatchObject({ stages: [CREATED_AT_YEAR_STAGE] });
    expect(await screen.findByText("Showing 5 rows")).toBeInTheDocument();

    setupDatasetForStage(
      PRODUCT_CATEGORY_STAGE,
      createResultDataset({
        cols: [
          createProductsCategoryDatasetColumn({
            display_name: "Product → Category",
            source: "breakout",
          }),
          TIMESERIES_METRIC_COLUMN,
        ],
        rows: [
          ["Doohickey", 3976],
          ["Gadget", 4939],
          ["Gizmo", 4784],
          ["Widget", 5061],
        ],
      }),
    );

    await userEvent.click(screen.getByTestId("notebook-button"));
    await userEvent.click(
      within(await screen.findByTestId("breakout-step")).getByText(
        "Created At: Year",
      ),
    );
    await userEvent.click(await screen.findByText("Product"));
    await userEvent.click(await screen.findByText("Category"));
    expect(
      await within(screen.getByTestId("breakout-step")).findByText(
        "Product → Category",
      ),
    ).toBeInTheDocument();
    const categoryBody = await visualize();

    expect(categoryBody).toMatchObject({ stages: [PRODUCT_CATEGORY_STAGE] });
    expect(await screen.findByText("Showing 4 rows")).toBeInTheDocument();
    expect(
      screen.getByText("Count of orders over time by Product → Category"),
    ).toBeInTheDocument();
    await waitForChartText("Product → Category");
  });

  it("should be able to drill-thru with a metric by breaking out the point by another dimension, and go back", async () => {
    const { router } = await setup({
      card: QUESTION_WITH_TIMESERIES_METRIC,
      dataset: TIMESERIES_DATASET,
      metadata: createMetricMetadata(TIMESERIES_METRIC),
    });
    setupDatasetForStage(
      BREAK_OUT_BY_SOURCE_STAGE,
      createResultDataset({
        cols: [
          createMockColumn({
            name: "SOURCE",
            display_name: "User → Source",
            base_type: "type/Text",
            source: "breakout",
          }),
          TIMESERIES_METRIC_COLUMN,
        ],
        rows: [
          ["Affiliate", 4],
          ["Google", 7],
        ],
      }),
    );
    const header = screen.getByTestId("qb-header");
    expect(
      within(header).getByText("Question with metric"),
    ).toBeInTheDocument();

    await waitForChartText("Created At: Month");

    await clickChartPoint([DRILL_POINT, DRILL_COUNT]);
    const clickActions = await screen.findByTestId("click-actions-view");
    await userEvent.click(within(clickActions).getByText("Break out by…"));
    await userEvent.click(await screen.findByText("Category"));
    await userEvent.click(await screen.findByText("User"));
    await userEvent.click(await screen.findByText("Source"));
    const body = await waitForDatasetRequest(0);

    expect(body).toMatchObject({ stages: [BREAK_OUT_BY_SOURCE_STAGE] });
    expect(
      await within(header).findByText(
        "Count of orders over time by User → Source",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Showing 2 rows")).toBeInTheDocument();
    await waitForChartText("User → Source");

    act(() => router.back());

    expect(
      await within(header).findByText("Question with metric"),
    ).toBeInTheDocument();
    expect(
      within(header).queryByText("Count of orders over time by User → Source"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Showing 3 rows")).toBeInTheDocument();
    await waitForChartText("Created At: Month");
    expect(
      within(await findChart()).queryByText("User → Source"),
    ).not.toBeInTheDocument();
  });
});
