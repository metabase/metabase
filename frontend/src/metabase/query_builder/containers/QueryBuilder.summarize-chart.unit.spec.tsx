import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupCardEndpoints } from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Dataset, DatasetColumn, RowValue } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
  createProductsTableDatasetColumns,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

const PRODUCTS_CARD = createMockUnsavedCard({
  display: "table",
  visualization_settings: {},
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
    }),
  ),
});

const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const MONTHS = [
  "2026-04-01T00:00:00Z",
  "2027-04-01T00:00:00Z",
  "2028-04-01T00:00:00Z",
];

const COUNT_CLAUSE = ["count", expect.anything()];

const CATEGORY_BREAKOUT = ["field", expect.anything(), PRODUCTS.CATEGORY];

const CREATED_AT_MONTH_BREAKOUT = [
  "field",
  expect.objectContaining({ "temporal-unit": "month" }),
  PRODUCTS.CREATED_AT,
];

const CATEGORY_STAGE = {
  "source-table": PRODUCTS_ID,
  aggregation: [COUNT_CLAUSE],
  breakout: [CATEGORY_BREAKOUT],
};

const CATEGORY_AND_CREATED_AT_STAGE = {
  "source-table": PRODUCTS_ID,
  aggregation: [COUNT_CLAUSE],
  breakout: [CATEGORY_BREAKOUT, CREATED_AT_MONTH_BREAKOUT],
};

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const CATEGORY_COLUMN = createProductsCategoryDatasetColumn({
  source: "breakout",
  field_ref: ["field", PRODUCTS.CATEGORY, null],
});

const CREATED_AT_MONTH_COLUMN = createProductsCreatedAtDatasetColumn({
  display_name: "Created At: Month",
  source: "breakout",
  unit: "month",
  field_ref: ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
});

const EMPTY_DATASET = createMockDataset({
  data: createMockDatasetData({ cols: [], rows: [] }),
  row_count: 0,
});

const PRODUCTS_DATASET = createDataset(createProductsTableDatasetColumns(), []);

const CATEGORY_DATASET = createDataset(
  [CATEGORY_COLUMN, COUNT_COLUMN],
  CATEGORIES.map((category, index) => [category, 50 + index]),
);

const CATEGORY_AND_CREATED_AT_DATASET = createDataset(
  [CATEGORY_COLUMN, CREATED_AT_MONTH_COLUMN, COUNT_COLUMN],
  CATEGORIES.flatMap((category, categoryIndex) =>
    MONTHS.map((month, monthIndex) => [
      category,
      month,
      10 * categoryIndex + monthIndex + 1,
    ]),
  ),
);

function createDataset(cols: DatasetColumn[], rows: RowValue[][]): Dataset {
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
  return removeUuids(JSON.parse(String(call.options.body)));
}

function matchesStage(body: unknown, stage: object): boolean {
  try {
    expect(body).toEqual(
      expect.objectContaining({ stages: [expect.objectContaining(stage)] }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Stands in for POST /api/dataset: each dataset is returned only for the query
 * with the matching breakouts, any other query gets no rows.
 */
function setupDatasetEndpoint() {
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) => {
      const body = getRequestBody(call);
      if (matchesStage(body, CATEGORY_AND_CREATED_AT_STAGE)) {
        return CATEGORY_AND_CREATED_AT_DATASET;
      }
      if (matchesStage(body, CATEGORY_STAGE)) {
        return CATEGORY_DATASET;
      }
      return EMPTY_DATASET;
    },
  });
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}

async function waitForDatasetRequest(previousCount: number) {
  await waitFor(() =>
    expect(getDatasetCalls().length).toBeGreaterThan(previousCount),
  );
  // wait for the response, so a slow query cannot fail the chart assertions
  await act(() => fetchMock.callHistory.flush(true));
  const calls = getDatasetCalls();
  return getRequestBody(calls[calls.length - 1]);
}

async function addBreakout(columnName: string) {
  const sidebar = screen.getByTestId("sidebar-right");
  const item = await within(sidebar).findByRole("listitem", {
    name: columnName,
  });
  const previousCount = getDatasetCalls().length;
  await userEvent.click(within(item).getByLabelText("Add dimension"));
  return waitForDatasetRequest(previousCount);
}

async function findChart() {
  return screen.findByTestId("chart-container");
}

async function findLegend() {
  return screen.findByLabelText("Legend");
}

async function assertChartByCategory() {
  const chart = await findChart();
  await waitFor(() =>
    expect(within(chart).getByText("Category")).toBeInTheDocument(),
  );
  expect(within(chart).getByText("Count")).toBeInTheDocument();
  CATEGORIES.forEach((category) =>
    expect(within(chart).getByText(category)).toBeInTheDocument(),
  );
}

async function assertChartByCreatedAtAndCategory() {
  const chart = await findChart();
  await waitFor(() =>
    expect(within(chart).getByText("Created At: Month")).toBeInTheDocument(),
  );
  expect(within(chart).getByText("Count")).toBeInTheDocument();
  ["April 2026", "April 2027", "April 2028"].forEach((month) =>
    expect(within(chart).getByText(month)).toBeInTheDocument(),
  );
  CATEGORIES.forEach((category) =>
    expect(within(chart).queryByText(category)).not.toBeInTheDocument(),
  );

  const legend = await findLegend();
  CATEGORIES.forEach((category) =>
    expect(within(legend).getByText(category)).toBeInTheDocument(),
  );
}

describe("QueryBuilder > summarize sidebar > chart", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("should update chart metrics and dimensions with each added breakout (metabase#44532)", async () => {
    await setup({
      card: PRODUCTS_CARD,
      dataset: PRODUCTS_DATASET,
      // The sample database runs queries as they change, so the sidebar runs each new breakout
      database: createSampleDatabase({ auto_run_queries: true }),
    });
    setupDatasetEndpoint();

    await userEvent.click(
      await screen.findByRole("button", { name: /Summarize/ }),
    );

    const categoryBody = await addBreakout("Category");
    expect(categoryBody).toEqual(
      expect.objectContaining({
        stages: [expect.objectContaining(CATEGORY_STAGE)],
      }),
    );
    await assertChartByCategory();

    const createdAtBody = await addBreakout("Created At");
    expect(createdAtBody).toEqual(
      expect.objectContaining({
        stages: [expect.objectContaining(CATEGORY_AND_CREATED_AT_STAGE)],
      }),
    );
    await assertChartByCreatedAtAndCategory();

    const previousCount = getDatasetCalls().length;
    await userEvent.click(
      within(screen.getByTestId("sidebar-right")).getByRole("button", {
        name: "Done",
      }),
    );
    const doneBody = await waitForDatasetRequest(previousCount);
    expect(doneBody).toEqual(
      expect.objectContaining({
        stages: [expect.objectContaining(CATEGORY_AND_CREATED_AT_STAGE)],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Summarize by")).not.toBeInTheDocument(),
    );
    await assertChartByCreatedAtAndCategory();
  });
});

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function getFirstStage(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== "object" || body == null || !("stages" in body)) {
    return undefined;
  }
  const [stage] = toArray(body.stages) ?? [];
  return typeof stage === "object" && stage != null
    ? Object.fromEntries(Object.entries(stage))
    : undefined;
}

/** The aggregations of the submitted stage, as `[operator, columnId?]` */
function getStageAggregations(body: unknown): unknown[] {
  const aggregations = toArray(getFirstStage(body)?.aggregation) ?? [];
  return aggregations.map((clause) => {
    const [operator, , argument] = toArray(clause) ?? [];
    const column = toArray(argument);
    return column ? [operator, column[2]] : [operator];
  });
}

/** `["field", { "temporal-unit": unit }, fieldId]` → `unit` of each breakout */
function getStageBreakoutUnits(body: unknown): unknown[] {
  const breakouts = toArray(getFirstStage(body)?.breakout) ?? [];
  return breakouts.map((clause) => {
    const options = toArray(clause)?.[1];
    return typeof options === "object" &&
      options != null &&
      "temporal-unit" in options
      ? options["temporal-unit"]
      : null;
  });
}

/** `["field", opts, nameOrId]` → `nameOrId` of each breakout */
function getStageBreakoutColumns(body: unknown): unknown[] {
  const breakouts = toArray(getFirstStage(body)?.breakout) ?? [];
  return breakouts.map((clause) => toArray(clause)?.[2]);
}

function getSidebar() {
  return screen.getByTestId("sidebar-right");
}

async function openSummarizeSidebar() {
  await userEvent.click(
    await screen.findByRole("button", { name: /Summarize/ }),
  );
  return await screen.findByTestId("sidebar-right");
}

describe("QueryBuilder > summarize sidebar > aggregations", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("should remove the sort of a removed aggregation and keep the other aggregations unsorted (metabase#12625)", async () => {
    const yearColumn = createOrdersCreatedAtDatasetColumn({
      display_name: "Created At: Year",
      source: "breakout",
      unit: "year",
      field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
    });
    const countColumn = COUNT_COLUMN;
    const sumOfSubtotalColumn = createMockColumn({
      name: "sum",
      display_name: "Sum of Subtotal",
      base_type: "type/Float",
      effective_type: "type/Float",
      source: "aggregation",
      field_ref: ["aggregation", 1],
    });
    const sumOfTotalColumn = createMockColumn({
      name: "sum_2",
      display_name: "Sum of Total",
      base_type: "type/Float",
      effective_type: "type/Float",
      source: "aggregation",
      field_ref: ["aggregation", 2],
    });
    const card = createMockCard({
      id: 12625,
      name: "12625",
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [
                { type: "operator", operator: "count" },
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "SUBTOTAL" }],
                },
                {
                  type: "operator",
                  operator: "sum",
                  name: "sum_2",
                  args: [{ type: "column", name: "TOTAL" }],
                },
              ],
              breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
              orderBys: [{ direction: "desc", type: "column", name: "sum" }],
            },
          ],
        }),
      ),
    });

    await setup({
      card,
      database: createSampleDatabase({ auto_run_queries: true }),
      dataset: createDataset(
        [yearColumn, countColumn, sumOfSubtotalColumn, sumOfTotalColumn],
        [["2025-01-01T00:00:00Z", 744, 30000, 40000]],
      ),
    });
    // Rows come back only for the expected aggregations, and only when the
    // query has no sort left
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const body = getRequestBody(call);
        const stage = getFirstStage(body);
        const isOrdersByYearWithoutSortOrFilter =
          stage?.["source-table"] === ORDERS_ID &&
          stage["order-by"] == null &&
          stage.filters == null &&
          JSON.stringify(getStageBreakoutColumns(body)) ===
            JSON.stringify([ORDERS.CREATED_AT]) &&
          JSON.stringify(getStageBreakoutUnits(body)) ===
            JSON.stringify(["year"]);
        if (!isOrdersByYearWithoutSortOrFilter) {
          return EMPTY_DATASET;
        }
        const aggregations = JSON.stringify(getStageAggregations(body));
        if (
          aggregations === JSON.stringify([["count"], ["sum", ORDERS.TOTAL]])
        ) {
          return createDataset(
            [
              yearColumn,
              countColumn,
              { ...sumOfTotalColumn, field_ref: ["aggregation", 1] },
            ],
            [["2025-01-01T00:00:00Z", 744, 40000]],
          );
        }
        if (aggregations === JSON.stringify([["count"]])) {
          return createDataset(
            [yearColumn, countColumn],
            [["2025-01-01T00:00:00Z", 744]],
          );
        }
        return EMPTY_DATASET;
      },
    });

    expect(await screen.findAllByTestId("header-cell")).toHaveLength(4);
    const sortedHeader = screen.getByRole("columnheader", {
      name: /Sum of Subtotal/,
    });
    expect(
      within(sortedHeader).getByLabelText("chevrondown icon"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("header-sort-indicator")).toHaveLength(1);

    const sidebar = await openSummarizeSidebar();
    let previousCount = getDatasetCalls().length;
    await userEvent.click(
      within(within(sidebar).getByLabelText("Sum of Subtotal")).getByLabelText(
        "close icon",
      ),
    );
    let body = await waitForDatasetRequest(previousCount);
    expect(getStageAggregations(body)).toEqual([
      ["count"],
      ["sum", ORDERS.TOTAL],
    ]);
    expect(getFirstStage(body)?.["order-by"]).toBeUndefined();
    expect(getFirstStage(body)).toMatchObject({ "source-table": ORDERS_ID });
    expect(getStageBreakoutColumns(body)).toEqual([ORDERS.CREATED_AT]);
    expect(getStageBreakoutUnits(body)).toEqual(["year"]);
    expect(
      within(getSidebar()).queryByLabelText("Sum of Subtotal"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByTestId("header-cell")).toHaveLength(3),
    );
    expect(
      screen.queryByRole("columnheader", { name: /Sum of Subtotal/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("header-sort-indicator"),
    ).not.toBeInTheDocument();

    previousCount = getDatasetCalls().length;
    await userEvent.click(
      within(
        within(getSidebar()).getByLabelText("Sum of Total"),
      ).getByLabelText("close icon"),
    );
    body = await waitForDatasetRequest(previousCount);
    expect(getStageAggregations(body)).toEqual([["count"]]);
    expect(
      within(getSidebar()).queryByLabelText("Sum of Total"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByTestId("header-cell")).toHaveLength(2),
    );
    expect(
      screen.getAllByRole("gridcell").map((cell) => cell.textContent),
    ).toContain("744");
  });

  it("should keep the aggregation of a question based on a native question when adding another one from the sidebar (metabase#15725)", async () => {
    const catColumn = createMockColumn({
      name: "CAT",
      display_name: "CAT",
      base_type: "type/Text",
      effective_type: "type/Text",
      field_ref: ["field", "CAT", { "base-type": "type/Text" }],
    });
    const valColumn = createMockColumn({
      name: "VAL",
      display_name: "VAL",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      field_ref: ["field", "VAL", { "base-type": "type/Integer" }],
    });
    const nativeCard = createMockCard({
      id: 15725,
      name: "15725",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
          query: "select 'A' as cat, 5 as val",
        }),
      ),
      result_metadata: [catColumn, valColumn],
    });
    const database = createSampleDatabase({ auto_run_queries: true });
    const provider = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [database],
        questions: [nativeCard],
      }),
    });
    const card = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(provider, {
          stages: [
            {
              source: { type: "card", id: nativeCard.id },
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [{ type: "column", name: "CAT" }],
            },
          ],
        }),
      ),
    });
    const catBreakoutColumn = { ...catColumn, source: "breakout" };
    const sumOfValColumn = createMockColumn({
      name: "sum",
      display_name: "Sum of VAL",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      source: "aggregation",
      field_ref: ["aggregation", 1],
    });

    setupCardEndpoints(nativeCard);
    await setup({
      card,
      database,
      metadata: createMockCardQueryMetadata({
        databases: [database],
        cards: [nativeCard],
      }),
      dataset: createDataset([catBreakoutColumn, COUNT_COLUMN], [["A", 1]]),
    });
    // The row comes back only when both aggregations are grouped by CAT
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const body = getRequestBody(call);
        const stage = getFirstStage(body);
        const isNativeCardWithoutSortOrFilter =
          stage?.["source-card"] === nativeCard.id &&
          stage["order-by"] == null &&
          stage.filters == null;
        const hasBothAggregations =
          JSON.stringify(getStageAggregations(body)) ===
          JSON.stringify([["count"], ["sum", "VAL"]]);
        const isGroupedByCat =
          JSON.stringify(getStageBreakoutColumns(body)) ===
          JSON.stringify(["CAT"]);
        return isNativeCardWithoutSortOrFilter &&
          hasBothAggregations &&
          isGroupedByCat
          ? createDataset(
              [catBreakoutColumn, COUNT_COLUMN, sumOfValColumn],
              [["A", 1, 5]],
            )
          : EMPTY_DATASET;
      },
    });

    const sidebar = await openSummarizeSidebar();
    await userEvent.click(
      within(sidebar).getByTestId("add-aggregation-button"),
    );
    await userEvent.click(await screen.findByText(/^Sum of/));
    const previousCount = getDatasetCalls().length;
    await userEvent.click(
      await within(
        await screen.findByTestId("aggregation-column-picker"),
      ).findByText("VAL"),
    );
    const body = await waitForDatasetRequest(previousCount);
    expect(getStageAggregations(body)).toEqual([["count"], ["sum", "VAL"]]);
    expect(getStageBreakoutColumns(body)).toEqual(["CAT"]);
    expect(getFirstStage(body)).toMatchObject({
      "source-card": nativeCard.id,
    });
    expect(getFirstStage(body)?.filters).toBeUndefined();
    expect(getFirstStage(body)?.["order-by"]).toBeUndefined();

    await userEvent.click(
      within(getSidebar()).getByRole("button", { name: "Done" }),
    );
    await userEvent.click(await screen.findByLabelText("Switch to data"));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("columnheader")
          .map((header) => header.textContent)
          .filter((text) => text !== ""),
      ).toEqual(["CAT", "Count", "Sum of VAL"]),
    );
    expect(
      screen.getAllByRole("gridcell").map((cell) => cell.textContent),
    ).toEqual(expect.arrayContaining(["A", "1", "5"]));
  });

  it("should show the server error without the run button overlay when the query fails (metabase#12586)", async () => {
    await setup({
      card: PRODUCTS_CARD,
      dataset: PRODUCTS_DATASET,
      database: createSampleDatabase({ auto_run_queries: true }),
    });
    fetchMock.modifyRoute("dataset-post", {
      response: { throws: new TypeError("Failed to fetch") },
    });

    const sidebar = await openSummarizeSidebar();
    const previousCount = getDatasetCalls().length;
    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(getDatasetCalls().length).toBeGreaterThan(previousCount),
    );

    expect(
      await screen.findByText("We're experiencing server issues"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("run-button-overlay")).getByTestId(
        "run-button",
      ),
    ).toHaveAttribute("aria-hidden", "true");
  });
});
