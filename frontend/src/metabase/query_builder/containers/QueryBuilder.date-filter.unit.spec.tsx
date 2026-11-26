import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { RowValue } from "metabase-types/api";
import {
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

const ORDERS_CARD = createMockUnsavedCard({
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          fields: [
            { type: "column", name: "ID" },
            { type: "column", name: "CREATED_AT" },
          ],
        },
      ],
    }),
  ),
});

// The sample database runs queries automatically, so the query builder runs
// the query again after a filter change
const SAMPLE_DATABASE = createSampleDatabase({ auto_run_queries: true });

const COLS = [
  createOrdersIdDatasetColumn(),
  createOrdersCreatedAtDatasetColumn(),
];

function createDataset(rows: RowValue[][]) {
  return createMockDataset({
    data: createMockDatasetData({ rows, cols: COLS }),
    row_count: rows.length,
  });
}

const UNFILTERED_DATASET = createDataset([
  [1, "2027-11-17T10:00:00Z"],
  [2, "2027-11-18T00:00:00Z"],
]);

// A filter on the whole day matches orders made at any time on Nov 18
const DATE_FILTER_DATASET = createDataset(
  Array.from({ length: 16 }, (_, index) => [
    index + 1,
    `2027-11-18T${String(index).padStart(2, "0")}:15:00Z`,
  ]),
);

// A filter on 00:00 matches only the order made in that minute
const DATETIME_FILTER_DATASET = createDataset([[2, "2027-11-18T00:00:00Z"]]);

type FilterClause = [string, unknown, unknown, ...unknown[]];

function getRunFilters(call: CallLog): FilterClause[] {
  const body = JSON.parse(String(call.options.body));
  return body?.stages?.[0]?.filters ?? [];
}

function isCreatedAtFilter(filter: FilterClause, value: string) {
  const [operator, , column, ...values] = filter;
  return (
    operator === "=" &&
    Array.isArray(column) &&
    column[0] === "field" &&
    column[2] === ORDERS.CREATED_AT &&
    values.length === 1 &&
    values[0] === value
  );
}

function getDatasetForRun(call: CallLog) {
  const filters = getRunFilters(call);
  if (filters.length !== 1) {
    return UNFILTERED_DATASET;
  }
  if (isCreatedAtFilter(filters[0], "2027-11-18")) {
    return DATE_FILTER_DATASET;
  }
  if (isCreatedAtFilter(filters[0], "2027-11-18T00:00:00")) {
    return DATETIME_FILTER_DATASET;
  }
  return UNFILTERED_DATASET;
}

function getLastRunFilters() {
  const call = fetchMock.callHistory.lastCall("path:/api/dataset", {
    method: "POST",
  });
  return call ? getRunFilters(call) : [];
}

describe("QueryBuilder date filters", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  afterEach(() => {
    jest.resetAllMocks();
    setupJestCanvasMock();
  });

  it("should differentiate between date and datetime filters with 00:00 time (metabase#43057)", async () => {
    await setup({
      card: ORDERS_CARD,
      dataset: UNFILTERED_DATASET,
      database: SAMPLE_DATABASE,
    });
    fetchMock.modifyRoute("dataset-post", { response: getDatasetForRun });

    // set the date and verify the filter and results
    const headerCell = await screen.findByRole("columnheader", {
      name: "Created At",
    });
    await userEvent.click(within(headerCell).getByText("Created At"));
    await userEvent.click(
      await screen.findByRole("button", { name: /Filter by this column/ }),
    );
    await userEvent.click(await screen.findByText("Fixed date range…"));
    await userEvent.click(await screen.findByText("On"));
    const dateInput = await screen.findByLabelText("Date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "November 18, 2027");
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    const filtersPanel = await screen.findByTestId("qb-filters-panel");
    expect(
      await within(filtersPanel).findByText("Created At is on Nov 18, 2027"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Showing 16 rows")).toBeInTheDocument();
    expect(getLastRunFilters()).toEqual([
      ["=", expect.anything(), expect.anything(), "2027-11-18"],
    ]);
    expect(isCreatedAtFilter(getLastRunFilters()[0], "2027-11-18")).toBe(true);

    // set time to 00:00 and verify the filter and results
    await userEvent.click(
      within(filtersPanel).getByText("Created At is on Nov 18, 2027"),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Add time" }),
    );
    expect(screen.getByLabelText("Time")).toHaveValue("00:00");
    await userEvent.click(
      screen.getByRole("button", { name: "Update filter" }),
    );

    expect(
      await within(filtersPanel).findByText(
        "Created At is Nov 18, 2027, 12:00 AM",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Showing 1 row")).toBeInTheDocument();
    expect(getLastRunFilters()).toEqual([
      ["=", expect.anything(), expect.anything(), "2027-11-18T00:00:00"],
    ]);
    expect(
      isCreatedAtFilter(getLastRunFilters()[0], "2027-11-18T00:00:00"),
    ).toBe(true);

    // remove time and verify the filter and results
    await userEvent.click(
      within(filtersPanel).getByText("Created At is Nov 18, 2027, 12:00 AM"),
    );
    expect(await screen.findByLabelText("Time")).toHaveValue("00:00");
    await userEvent.click(screen.getByRole("button", { name: "Remove time" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Update filter" }),
    );

    expect(
      await within(filtersPanel).findByText("Created At is on Nov 18, 2027"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Showing 16 rows")).toBeInTheDocument();
    expect(getLastRunFilters()).toEqual([
      ["=", expect.anything(), expect.anything(), "2027-11-18"],
    ]);
    expect(isCreatedAtFilter(getLastRunFilters()[0], "2027-11-18")).toBe(true);
  });
});
