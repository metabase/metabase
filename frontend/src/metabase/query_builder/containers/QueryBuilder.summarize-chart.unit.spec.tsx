import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Dataset, DatasetColumn, RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
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
