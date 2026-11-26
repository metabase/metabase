import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  RowValue,
  TestStageWithSourceSpec,
  VisualizationDisplay,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

// Chart components are loaded on demand. Load the ones these tests render up
// front, so a chart shows up as soon as its results arrive.
beforeAll(() =>
  loadVisualizationComponents(["bar", "line", "table", "scalar"]),
);

/** The parts of a submitted MBQL 5 query that these tests check. */
type SubmittedClause = [string, Record<string, unknown>, ...unknown[]];
type SubmittedStage = {
  "source-card"?: number;
  aggregation?: SubmittedClause[];
  breakout?: SubmittedClause[];
  filters?: SubmittedClause[];
  "order-by"?: SubmittedClause[];
};
type SubmittedQuery = { stages: SubmittedStage[] };

function parseQuery(call: CallLog): SubmittedQuery {
  return JSON.parse(String(call.options.body));
}

function getSubmittedQueries(): SubmittedQuery[] {
  return fetchMock.callHistory.calls("path:/api/dataset").map(parseQuery);
}

function getLastSubmittedQuery(): SubmittedQuery {
  const queries = getSubmittedQueries();
  expect(queries.length).toBeGreaterThan(0);
  return queries[queries.length - 1];
}

/** `["field", opts, "count"]`: a column of the previous stage, by name */
function isPreviousStageColumn(arg: unknown, name: string) {
  return Array.isArray(arg) && arg[0] === "field" && arg[2] === name;
}

function createDataset(
  cols: ReturnType<typeof createMockColumn>[],
  rows: RowValue[][],
) {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

const EMPTY_DATASET = createDataset([], []);

const NATIVE_CARD_ID = 15725;

async function setupNotebook(
  stage: TestStageWithSourceSpec,
  display: VisualizationDisplay = "table",
) {
  const card = createMockUnsavedCard({
    display,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
    ),
  });
  return setup({
    card,
    initialRoute: `/question/notebook#${serializeCardForUrl(card)}`,
  });
}

async function visualize() {
  const callCount = getSubmittedQueries().length;
  await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
  await waitFor(() =>
    expect(getSubmittedQueries()).toHaveLength(callCount + 1),
  );
}

/** Switches the chart that the query builder picked to the results table */
async function showResultsTable() {
  await userEvent.click(await screen.findByLabelText("Switch to data"));
  expect(await screen.findByTestId("table-root")).toBeInTheDocument();
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

describe("QueryBuilder > visualizing a notebook query", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("runs a query sorted by a custom aggregation in both directions (metabase#6239)", async () => {
    const createdAtColumn = createMockColumn({
      id: ORDERS.CREATED_AT,
      name: "CREATED_AT",
      display_name: "Created At: Month",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      source: "breakout",
      unit: "month",
      field_ref: [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    });
    const ceColumn = createMockNumericColumn({
      name: "CE",
      display_name: "CE",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });
    const ascRows = [
      ["2022-04-01T00:00:00Z", 1],
      ["2022-05-01T00:00:00Z", 19],
    ];
    const descRows = [
      ["2025-01-01T00:00:00Z", 584],
      ["2024-12-01T00:00:00Z", 570],
    ];

    await setupNotebook({
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        {
          name: "CE",
          value: {
            type: "operator",
            operator: "count-where",
            args: [
              {
                type: "operator",
                operator: ">",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: 0 },
                ],
              },
            ],
          },
        },
      ],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    });
    // Rows come back sorted only for a query ordered by the CE aggregation
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const [stage] = parseQuery(call).stages;
        const direction = getCeOrderDirection(stage);
        if (direction === "asc") {
          return createDataset([createdAtColumn, ceColumn], ascRows);
        }
        if (direction === "desc") {
          return createDataset([createdAtColumn, ceColumn], descRows);
        }
        return EMPTY_DATASET;
      },
    });

    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    await userEvent.click(
      within(summarizeStep).getByRole("button", { name: "Sort" }),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("CE"));
    await visualize();
    expect(getCeOrderDirection(getLastSubmittedQuery().stages[0])).toBe("asc");
    // A line chart renders first, as in the app
    expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
    await showResultsTable();

    const ceHeader = await screen.findByRole("columnheader", { name: /CE/ });
    expect(within(ceHeader).getByLabelText("chevronup icon")).toBeVisible();
    await waitFor(() => expect(getRowValues()[0][1]).toBe("1"));

    await userEvent.click(screen.getByTestId("notebook-button"));
    const sortStep = await screen.findByTestId("step-sort-0-0");
    await userEvent.click(within(sortStep).getByLabelText("arrow_up icon"));
    expect(
      await within(sortStep).findByLabelText("arrow_down icon"),
    ).toBeVisible();
    expect(
      within(sortStep).queryByLabelText("arrow_up icon"),
    ).not.toBeInTheDocument();
    await visualize();

    expect(getCeOrderDirection(getLastSubmittedQuery().stages[0])).toBe("desc");
    const descCeHeader = await screen.findByRole("columnheader", {
      name: /CE/,
    });
    expect(
      await within(descCeHeader).findByLabelText("chevrondown icon"),
    ).toBeVisible();
    await waitFor(() => expect(getRowValues()[0][1]).toBe("584"));
  });

  it("runs a query filtered by an aggregation of the previous stage (metabase#27104)", async () => {
    const sourceColumn = createMockColumn({
      id: PEOPLE.SOURCE,
      name: "SOURCE",
      display_name: "User → Source",
      base_type: "type/Text",
      effective_type: "type/Text",
      source: "fields",
      field_ref: ["field", "SOURCE", { "base-type": "type/Text" }],
    });
    const countColumn = createMockNumericColumn({
      name: "count",
      display_name: "Count",
      source: "fields",
      field_ref: ["field", "count", { "base-type": "type/BigInteger" }],
    });
    const sourceRows = [
      ["Affiliate", 3520],
      ["Facebook", 3708],
      ["Google", 3594],
      ["Organic", 3598],
      ["Twitter", 4130],
    ];

    await setupNotebook(
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [
          {
            type: "column",
            fieldId: PEOPLE.SOURCE,
            sourceFieldId: ORDERS.USER_ID,
          },
        ],
      },
      "bar",
    );
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) =>
        isCountGreaterThanZero(parseQuery(call))
          ? createDataset([sourceColumn, countColumn], sourceRows)
          : EMPTY_DATASET,
    });

    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    await userEvent.click(
      within(summarizeStep).getByRole("button", { name: "Filter" }),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Count"));
    expect(
      await within(popover).findByRole("button", { name: "Back" }),
    ).toHaveTextContent(/^Count$/);
    await userEvent.click(within(popover).getByLabelText("Filter operator"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Greater than" }),
    );
    await userEvent.type(
      within(popover).getByPlaceholderText("Enter a number"),
      "0",
    );
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );
    await visualize();
    expect(isCountGreaterThanZero(getLastSubmittedQuery())).toBe(true);
    // A bar chart renders first; its rows are checked in the results table
    expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
    await showResultsTable();

    expect(
      await within(await screen.findByTestId("qb-filters-panel")).findByText(
        "Count is greater than 0",
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(getRowValues().map(([source]) => source)).toEqual([
        "Affiliate",
        "Facebook",
        "Google",
        "Organic",
        "Twitter",
      ]),
    );
  });

  it("runs a query that sums an aggregation of the previous stage (metabase#27462)", async () => {
    const sumColumn = createMockNumericColumn({
      name: "sum",
      display_name: "Sum of Count",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });

    await setupNotebook({
      source: { type: "table", id: PRODUCTS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "CATEGORY" }],
    });
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) =>
        isSumOfCount(parseQuery(call))
          ? createDataset([sumColumn], [[200]])
          : EMPTY_DATASET,
    });

    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Sum of ..."));
    await userEvent.click(await within(popover).findByText("Count"));
    await visualize();

    expect(isSumOfCount(getLastSubmittedQuery())).toBe(true);
    expect(
      await within(screen.getByTestId("query-builder-main")).findByText("200"),
    ).toBeVisible();
  });
});

describe("QueryBuilder > visualizing a notebook query based on a native question", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("runs a query with two aggregations grouped by a column of the native question (metabase#15725)", async () => {
    const catColumn = createMockColumn({
      name: "CAT",
      display_name: "CAT",
      base_type: "type/Text",
      effective_type: "type/Text",
      field_ref: ["field", "CAT", { "base-type": "type/Text" }],
    });
    const valColumn = createMockNumericColumn({
      name: "VAL",
      display_name: "VAL",
      field_ref: ["field", "VAL", { "base-type": "type/Integer" }],
    });
    const nativeCard = createMockCard({
      id: NATIVE_CARD_ID,
      name: "15725",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
          query: "select 'A' as cat, 5 as val",
        }),
      ),
      result_metadata: [catColumn, valColumn],
    });
    const database = createSampleDatabase();
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
          stages: [{ source: { type: "card", id: nativeCard.id } }],
        }),
      ),
    });
    const countColumn = createMockNumericColumn({
      name: "count",
      display_name: "Count",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });
    const sumColumn = createMockNumericColumn({
      name: "sum",
      display_name: "Sum of VAL",
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
      initialRoute: `/question/notebook#${serializeCardForUrl(card)}`,
    });
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) =>
        isCountAndSumOfValByCat(parseQuery(call))
          ? createDataset(
              [{ ...catColumn, source: "breakout" }, countColumn, sumColumn],
              [["A", 1, 5]],
            )
          : EMPTY_DATASET,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Summarize" }),
    );
    await userEvent.click(
      await within(await screen.findByTestId("clause-popover")).findByText(
        "Count of rows",
      ),
    );
    const summarizeStep = screen.getByTestId("step-summarize-0-0");
    await userEvent.click(
      within(
        within(summarizeStep).getByTestId("aggregate-step"),
      ).getByLabelText("add icon"),
    );
    let popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText(/^Sum of/));
    await userEvent.click(await within(popover).findByText("VAL"));
    expect(
      await within(summarizeStep).findByText("Sum of VAL"),
    ).toBeInTheDocument();
    expect(within(summarizeStep).getByText("Count")).toBeInTheDocument();
    await userEvent.click(
      within(summarizeStep).getByText("Pick a column to group by"),
    );
    popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("CAT"));
    await visualize();

    expect(isCountAndSumOfValByCat(getLastSubmittedQuery())).toBe(true);
    await showResultsTable();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("columnheader")
          .map((header) => header.textContent)
          .filter((text) => text !== ""),
      ).toEqual(["CAT", "Count", "Sum of VAL"]),
    );
    expect(getRowValues()).toEqual([["A", "1", "5"]]);
  });
});

/** The direction of the order-by on the aggregation named CE, if any */
function getCeOrderDirection(stage: SubmittedStage) {
  const ceAggregation = stage.aggregation?.find(
    ([, options]) => options.name === "CE",
  );
  const orderBys = stage["order-by"] ?? [];
  if (ceAggregation == null || orderBys.length !== 1) {
    return undefined;
  }
  const [[direction, , target]] = orderBys;
  const isCeReference =
    Array.isArray(target) &&
    target[0] === "aggregation" &&
    target[2] === ceAggregation[1]["lib/uuid"];
  return isCeReference ? direction : undefined;
}

function isCountGreaterThanZero({ stages }: SubmittedQuery) {
  if (stages.length !== 2 || stages[0].aggregation?.[0]?.[0] !== "count") {
    return false;
  }
  const filters = stages[1].filters ?? [];
  if (filters.length !== 1) {
    return false;
  }
  const [[operator, , column, value]] = filters;
  return (
    operator === ">" && isPreviousStageColumn(column, "count") && value === 0
  );
}

function isSumOfCount({ stages }: SubmittedQuery) {
  if (stages.length !== 2 || stages[0].aggregation?.[0]?.[0] !== "count") {
    return false;
  }
  const aggregations = stages[1].aggregation ?? [];
  if (aggregations.length !== 1) {
    return false;
  }
  const [[operator, , column]] = aggregations;
  return operator === "sum" && isPreviousStageColumn(column, "count");
}

function isCountAndSumOfValByCat({ stages }: SubmittedQuery) {
  if (stages.length !== 1) {
    return false;
  }
  const [{ aggregation = [], breakout = [], ...stage }] = stages;
  const [count, sum] = aggregation;
  return (
    stage["source-card"] === NATIVE_CARD_ID &&
    stage.filters == null &&
    stage["order-by"] == null &&
    aggregation.length === 2 &&
    count[0] === "count" &&
    sum[0] === "sum" &&
    isPreviousStageColumn(sum[2], "VAL") &&
    breakout.length === 1 &&
    isPreviousStageColumn(breakout[0], "CAT")
  );
}
