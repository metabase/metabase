import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  RowValue,
  TestBreakoutSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  createPeopleLatitudeDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

function createCard(tableId: number, breakouts: TestBreakoutSpec[]) {
  return createMockCard({
    id: 1,
    name: "Test question",
    display: "table",
    visualization_settings: { "table.pivot": false },
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: tableId },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts,
          },
        ],
      }),
    ),
  });
}

function createDataset(cols: DatasetColumn[], rows: RowValue[][]) {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

/** The backend names the second breakout of a column `<NAME>_2`. */
function createCreatedAtColumn(
  unit: "year" | "quarter" | "month",
  name: string,
) {
  const displayUnit = unit[0].toUpperCase() + unit.slice(1);
  return createOrdersCreatedAtDatasetColumn({
    name,
    display_name: `Created At: ${displayUnit}`,
    source: "breakout",
    unit,
    field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": unit }],
  });
}

const EMPTY_DATASET = createDataset([], []);

// The sample database runs queries as they change
const DATABASE = createSampleDatabase({ auto_run_queries: true });

type SubmittedStage = {
  sourceTable: unknown;
  breakout: unknown[];
  filters: unknown[];
  orderBy: unknown[];
};

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function getSubmittedStage(call: CallLog): SubmittedStage {
  const body: unknown = JSON.parse(String(call.options.body));
  if (typeof body !== "object" || body == null || !("stages" in body)) {
    throw new Error("Unexpected query");
  }
  const [stage] = toArray(body.stages) ?? [];
  if (typeof stage !== "object" || stage == null) {
    throw new Error("Unexpected query");
  }
  return {
    sourceTable: "source-table" in stage ? stage["source-table"] : null,
    breakout: "breakout" in stage ? (toArray(stage.breakout) ?? []) : [],
    filters: "filters" in stage ? (toArray(stage.filters) ?? []) : [],
    orderBy: "order-by" in stage ? (toArray(stage["order-by"]) ?? []) : [],
  };
}

function getSubmittedStages(): SubmittedStage[] {
  return fetchMock.callHistory
    .calls("path:/api/dataset")
    .map(getSubmittedStage);
}

/** `["field", { "temporal-unit": unit }, fieldId]` → the temporal unit */
function getTemporalUnit(clause: unknown): unknown {
  const [type, options] = toArray(clause) ?? [];
  if (type === "field" && typeof options === "object" && options != null) {
    return "temporal-unit" in options ? options["temporal-unit"] : null;
  }
  return null;
}

/**
 * `["=", opts, ["field", opts, ORDERS.CREATED_AT], date]` → `date`, or `null`
 * for any other filter.
 */
function getCreatedAtFilterDate(clause: unknown): unknown {
  const [operator, , column, value, ...rest] = toArray(clause) ?? [];
  const [columnType, , fieldId] = toArray(column) ?? [];
  const isCreatedAtEquality =
    operator === "=" &&
    rest.length === 0 &&
    columnType === "field" &&
    fieldId === ORDERS.CREATED_AT;
  return isCreatedAtEquality ? value : null;
}

function getBreakoutUnits(stage: SubmittedStage) {
  return stage.breakout.map(getTemporalUnit);
}

function getFilterDates(stage: SubmittedStage) {
  return stage.filters.map(getCreatedAtFilterDate);
}

function getLastSubmittedStage() {
  const stages = getSubmittedStages();
  expect(stages.length).toBeGreaterThan(0);
  return stages[stages.length - 1];
}

async function waitForNewQuery(previousCount: number) {
  await waitFor(() =>
    expect(getSubmittedStages().length).toBeGreaterThan(previousCount),
  );
  return getLastSubmittedStage();
}

function getColumnHeaders() {
  return screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent)
    .filter((text) => text !== "");
}

/** Cell texts of the table rows, without the row index column */
function getRowValues() {
  return screen
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .queryAllByRole("gridcell")
        .map((cell) => cell.textContent),
    )
    .filter((cells) => cells.length > 1);
}

describe("QueryBuilder > multiple breakouts of the same column", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should use the first breakout of the column for the timeseries chrome", async () => {
    const card = createCard(ORDERS_ID, [
      { type: "column", name: "CREATED_AT", unit: "year" },
      { type: "column", name: "CREATED_AT", unit: "month" },
    ]);
    const quarterColumn = createCreatedAtColumn("quarter", "CREATED_AT");
    const monthColumn = createCreatedAtColumn("month", "CREATED_AT_2");
    const cols = [quarterColumn, monthColumn, COUNT_COLUMN];

    await setup({
      card,
      database: DATABASE,
      dataset: createDataset(
        [
          createCreatedAtColumn("year", "CREATED_AT"),
          monthColumn,
          COUNT_COLUMN,
        ],
        [["2025-01-01T00:00:00Z", "2025-04-01T00:00:00Z", 1]],
      ),
    });
    // Rows come back only for a query by quarter and month, and only the row
    // of the filtered day when the query has a filter on Created At
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const stage = getSubmittedStage(call);
        const units = getBreakoutUnits(stage);
        const isOrdersByQuarterAndMonth =
          stage.sourceTable === ORDERS_ID &&
          stage.orderBy.length === 0 &&
          stage.breakout.every(
            (clause) => toArray(clause)?.[2] === ORDERS.CREATED_AT,
          ) &&
          units.join() === "quarter,month";
        if (!isOrdersByQuarterAndMonth) {
          return EMPTY_DATASET;
        }
        const dates = getFilterDates(stage);
        if (dates.length === 0) {
          return createDataset(cols, [
            ["2025-04-01T00:00:00Z", "2025-04-01T00:00:00Z", 1],
          ]);
        }
        if (dates.length === 1 && dates[0] === "2028-08-14") {
          return createDataset(cols, [
            ["2028-07-01T00:00:00Z", "2028-08-01T00:00:00Z", 14],
          ]);
        }
        if (dates.length === 1 && dates[0] === "2025-08-14") {
          return createDataset(cols, [
            ["2025-07-01T00:00:00Z", "2025-08-01T00:00:00Z", 1],
          ]);
        }
        return EMPTY_DATASET;
      },
    });

    const bucketButton = await screen.findByTestId("timeseries-bucket-button");
    expect(bucketButton).toHaveTextContent("Year");
    let previousCount = getSubmittedStages().length;
    await userEvent.click(bucketButton);
    await userEvent.click(await screen.findByText("Quarter"));
    let stage = await waitForNewQuery(previousCount);
    expect(getBreakoutUnits(stage)).toEqual(["quarter", "month"]);
    expect(getFilterDates(stage)).toEqual([]);
    await waitFor(() =>
      expect(getRowValues()).toEqual([["Q2 2025", "April 2025", "1"]]),
    );
    expect(getColumnHeaders()).toEqual([
      "Created At: Quarter",
      "Created At: Month",
      "Count",
    ]);

    const filterButton = screen.getByTestId("timeseries-filter-button");
    expect(filterButton).toHaveTextContent("All time");
    await userEvent.click(filterButton);
    await userEvent.click(await screen.findByDisplayValue("All time"));
    await userEvent.click(await screen.findByRole("option", { name: "On" }));
    const dateInput = await screen.findByLabelText("Date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "August 14, 2028");
    previousCount = getSubmittedStages().length;
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    stage = await waitForNewQuery(previousCount);
    expect(getBreakoutUnits(stage)).toEqual(["quarter", "month"]);
    expect(getFilterDates(stage)).toEqual(["2028-08-14"]);
    await waitFor(() =>
      expect(getRowValues()).toEqual([["Q3 2028", "August 2028", "14"]]),
    );

    expect(screen.getByTestId("timeseries-filter-button")).toHaveTextContent(
      "Aug 14",
    );
    await userEvent.click(screen.getByTestId("timeseries-filter-button"));
    const nextDateInput = await screen.findByLabelText("Date");
    await userEvent.clear(nextDateInput);
    await userEvent.type(nextDateInput, "August 14, 2025");
    previousCount = getSubmittedStages().length;
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    stage = await waitForNewQuery(previousCount);
    expect(getBreakoutUnits(stage)).toEqual(["quarter", "month"]);
    expect(getFilterDates(stage)).toEqual(["2025-08-14"]);
    await waitFor(() =>
      expect(getRowValues()).toEqual([["Q3 2025", "August 2025", "1"]]),
    );
  });
});

describe("QueryBuilder > multiple breakouts of the same column > column settings", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  async function renameColumn(columnName: string, newName: string) {
    const header = screen.getByRole("columnheader", { name: columnName });
    await userEvent.click(within(header).getByText(columnName));
    const clickActions = await screen.findByTestId("click-actions-view");
    await userEvent.click(
      within(clickActions).getByRole("button", { name: /gear icon/i }),
    );
    const input = await screen.findByDisplayValue(columnName);
    await userEvent.clear(input);
    await userEvent.type(input, newName);
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("column-formatting-settings"),
      ).not.toBeInTheDocument(),
    );
  }

  it.each([
    {
      title: "temporal",
      tableId: ORDERS_ID,
      breakouts: [
        { type: "column", name: "CREATED_AT", unit: "year" },
        { type: "column", name: "CREATED_AT", unit: "month" },
      ] satisfies TestBreakoutSpec[],
      cols: [
        createCreatedAtColumn("year", "CREATED_AT"),
        createCreatedAtColumn("month", "CREATED_AT_2"),
      ],
      rows: [["2025-01-01T00:00:00Z", "2025-04-01T00:00:00Z", 1]],
    },
    {
      title: "num-bins",
      tableId: ORDERS_ID,
      breakouts: [
        {
          type: "column",
          name: "TOTAL",
          binning: { strategy: "num-bins", numBins: 10 },
        },
        {
          type: "column",
          name: "TOTAL",
          binning: { strategy: "num-bins", numBins: 50 },
        },
      ] satisfies TestBreakoutSpec[],
      cols: [
        createOrdersTotalDatasetColumn({
          display_name: "Total: 10 bins",
          source: "breakout",
          field_ref: [
            "field",
            ORDERS.TOTAL,
            { binning: { strategy: "num-bins", "num-bins": 10 } },
          ],
        }),
        createOrdersTotalDatasetColumn({
          name: "TOTAL_2",
          display_name: "Total: 50 bins",
          source: "breakout",
          field_ref: [
            "field",
            ORDERS.TOTAL,
            { binning: { strategy: "num-bins", "num-bins": 50 } },
          ],
        }),
      ],
      rows: [[-60, -50, 1]],
    },
    {
      title: "bin-width",
      tableId: PEOPLE_ID,
      breakouts: [
        {
          type: "column",
          name: "LATITUDE",
          binning: { strategy: "bin-width", binWidth: 20 },
        },
        {
          type: "column",
          name: "LATITUDE",
          binning: { strategy: "bin-width", binWidth: 10 },
        },
      ] satisfies TestBreakoutSpec[],
      cols: [
        createPeopleLatitudeDatasetColumn({
          display_name: "Latitude: 20°",
          source: "breakout",
          field_ref: [
            "field",
            PEOPLE.LATITUDE,
            { binning: { strategy: "bin-width", "bin-width": 20 } },
          ],
        }),
        createPeopleLatitudeDatasetColumn({
          name: "LATITUDE_2",
          display_name: "Latitude: 10°",
          source: "breakout",
          field_ref: [
            "field",
            PEOPLE.LATITUDE,
            { binning: { strategy: "bin-width", "bin-width": 10 } },
          ],
        }),
      ],
      rows: [[20, 20, 87]],
    },
  ])(
    "should change the title of each $title breakout of a column separately",
    async ({ tableId, breakouts, cols, rows }) => {
      const [column1, column2] = cols;
      await setup({
        card: createCard(tableId, breakouts),
        database: DATABASE,
        dataset: createDataset([...cols, COUNT_COLUMN], rows),
      });
      expect(
        await screen.findByRole("columnheader", {
          name: column1.display_name,
        }),
      ).toBeInTheDocument();

      await renameColumn(column1.display_name, "Breakout1");
      expect(getColumnHeaders()).toEqual([
        "Breakout1",
        column2.display_name,
        "Count",
      ]);

      await renameColumn(column2.display_name, "Breakout2");
      expect(getColumnHeaders()).toEqual(["Breakout1", "Breakout2", "Count"]);
    },
  );
});
