import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  DatetimeUnit,
  RowValue,
  TestAggregationSpec,
  TestBreakoutSpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
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

const COUNT: TestAggregationSpec = { type: "operator", operator: "count" };

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const EMPTY_DATASET = createMockDataset({
  data: createMockDatasetData({ cols: [], rows: [] }),
  row_count: 0,
});

function createCard(stage: TestStageWithSourceSpec): Card {
  return createMockCard({
    id: 1,
    name: "Test question",
    display: "table",
    visualization_settings: { "table.pivot": false },
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
    ),
  });
}

const TEMPORAL_UNITS: Record<string, DatetimeUnit> = {
  Year: "year",
  Quarter: "quarter",
  Month: "month",
  Week: "week",
};

function createDataset(cols: DatasetColumn[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

/** The backend names a second breakout of a column with a `_2` suffix. */
function createBreakoutColumn(
  column: DatasetColumn,
  index: number,
  displayName: string,
): DatasetColumn {
  const unit = TEMPORAL_UNITS[displayName.split(": ")[1]];
  return {
    ...column,
    name: index === 0 ? column.name : `${column.name}_${index + 1}`,
    display_name: displayName,
    source: "breakout",
    ...(unit && { unit }),
  };
}

function createBreakoutsDataset(
  column: DatasetColumn,
  displayNames: string[],
  row: RowValue[],
) {
  return createDataset(
    [
      ...displayNames.map((displayName, index) =>
        createBreakoutColumn(column, index, displayName),
      ),
      COUNT_COLUMN,
    ],
    [row],
  );
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

function getRequestStage(call: CallLog): unknown {
  const body = removeUuids(JSON.parse(String(call.options.body)));
  if (
    typeof body === "object" &&
    body !== null &&
    "stages" in body &&
    Array.isArray(body.stages)
  ) {
    return body.stages[0];
  }
  throw new Error("No stages in the request");
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset");
}

function getLastStage() {
  const calls = getDatasetCalls();
  return getRequestStage(calls[calls.length - 1]);
}

function matches(actual: unknown, expected: unknown) {
  try {
    expect(actual).toEqual(expected);
    return true;
  } catch {
    return false;
  }
}

type DatasetResponse = {
  stage: Record<string, unknown>;
  dataset: Dataset;
};

/**
 * Stands in for POST /api/dataset: a dataset is returned only for the query
 * whose stage matches, any other query gets no rows.
 */
function setupDatasetEndpoint(responses: DatasetResponse[]) {
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) => {
      const stage = getRequestStage(call);
      const response = responses.find((response) =>
        matches(stage, expect.objectContaining(response.stage)),
      );
      return response?.dataset ?? EMPTY_DATASET;
    },
  });
}

/** Runs `action` and resolves once it has sent a query and got its response. */
async function waitForDatasetRequest(action: () => Promise<void>) {
  const previousCount = getDatasetCalls().length;
  await action();
  await waitFor(() =>
    expect(getDatasetCalls().length).toBeGreaterThan(previousCount),
  );
  await act(() => fetchMock.callHistory.flush(true));
  return getLastStage();
}

function temporalBreakout(fieldId: number, unit: string) {
  return ["field", expect.objectContaining({ "temporal-unit": unit }), fieldId];
}

function binningBreakout(fieldId: number, binning: Record<string, unknown>) {
  return ["field", expect.objectContaining({ binning }), fieldId];
}

function getHeaderNames() {
  return screen
    .getAllByTestId("header-cell")
    .map((cell) => cell.textContent?.trim());
}

async function findHeaderNames(names: string[]) {
  await waitFor(() => expect(getHeaderNames()).toEqual(names));
}

function getChipLabels(wellId: string) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

async function openSummarySidebar() {
  await userEvent.click(
    within(screen.getByTestId("qb-header")).getByRole("button", {
      name: /Summarize/,
    }),
  );
  await screen.findByTestId("summary-sidebar");
}

async function changeGroupingBucket(chipName: string, bucketName: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Change how ${chipName} is grouped` }),
  );
  const menu = await screen.findByRole("menu");
  await userEvent.click(
    within(menu).getByRole("menuitem", { name: bucketName }),
  );
}

type BreakoutsCase = {
  title: string;
  sourceTableId: number;
  fieldId: number;
  column: DatasetColumn;
  breakouts: TestBreakoutSpec[];
  initialDisplayNames: string[];
  chip1Name: string;
  bucket1Name: string;
  chip2Name: string;
  bucket2Name: string;
  breakout1: unknown;
  breakout2: unknown;
  initialBreakout2: unknown;
  finalDisplayNames: string[];
  finalRow: RowValue[];
};

const BREAKOUTS_CASES: BreakoutsCase[] = [
  {
    title: "temporal",
    sourceTableId: ORDERS_ID,
    fieldId: ORDERS.CREATED_AT,
    column: createOrdersCreatedAtDatasetColumn(),
    breakouts: [
      { type: "column", name: "CREATED_AT", unit: "year" },
      { type: "column", name: "CREATED_AT", unit: "month" },
    ],
    initialDisplayNames: ["Created At: Year", "Created At: Month"],
    chip1Name: "Created At: Year",
    bucket1Name: "Quarter",
    chip2Name: "Created At: Month",
    bucket2Name: "Week",
    breakout1: temporalBreakout(ORDERS.CREATED_AT, "quarter"),
    initialBreakout2: temporalBreakout(ORDERS.CREATED_AT, "month"),
    breakout2: temporalBreakout(ORDERS.CREATED_AT, "week"),
    finalDisplayNames: ["Created At: Quarter", "Created At: Week"],
    finalRow: ["2025-04-01T00:00:00Z", "2025-04-27T00:00:00Z", 1],
  },
  {
    title: "num-bins",
    sourceTableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
    column: createOrdersTotalDatasetColumn(),
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
    ],
    initialDisplayNames: ["Total: 10 bins", "Total: 50 bins"],
    chip1Name: "Total: 10 bins",
    bucket1Name: "100 bins",
    chip2Name: "Total: 50 bins",
    bucket2Name: "10 bins",
    breakout1: binningBreakout(ORDERS.TOTAL, {
      strategy: "num-bins",
      "num-bins": 100,
    }),
    initialBreakout2: binningBreakout(ORDERS.TOTAL, {
      strategy: "num-bins",
      "num-bins": 50,
    }),
    breakout2: binningBreakout(ORDERS.TOTAL, {
      strategy: "num-bins",
      "num-bins": 10,
    }),
    finalDisplayNames: ["Total: 100 bins", "Total: 10 bins"],
    finalRow: [-46, -60, 1],
  },
  {
    title: "bin-width",
    sourceTableId: PEOPLE_ID,
    fieldId: PEOPLE.LATITUDE,
    column: createPeopleLatitudeDatasetColumn(),
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
    ],
    initialDisplayNames: ["Latitude: 20°", "Latitude: 10°"],
    chip1Name: "Latitude: 20°",
    bucket1Name: "Bin every 1 degree",
    chip2Name: "Latitude: 10°",
    bucket2Name: "Bin every 0.1 degrees",
    breakout1: binningBreakout(PEOPLE.LATITUDE, {
      strategy: "bin-width",
      "bin-width": 1,
    }),
    initialBreakout2: binningBreakout(PEOPLE.LATITUDE, {
      strategy: "bin-width",
      "bin-width": 10,
    }),
    breakout2: binningBreakout(PEOPLE.LATITUDE, {
      strategy: "bin-width",
      "bin-width": 0.1,
    }),
    finalDisplayNames: ["Latitude: 1°", "Latitude: 0.1°"],
    finalRow: [25, 25.7, 1],
  },
];

async function setupBreakoutsCard({
  sourceTableId,
  column,
  breakouts,
  initialDisplayNames,
}: Pick<
  BreakoutsCase,
  "sourceTableId" | "column" | "breakouts" | "initialDisplayNames"
>) {
  const card = createCard({
    source: { type: "table", id: sourceTableId },
    aggregations: [COUNT],
    breakouts,
  });
  await setup({
    card,
    dataset: createBreakoutsDataset(column, initialDisplayNames, [
      null,
      null,
      1,
    ]),
    database: createSampleDatabase({ auto_run_queries: true }),
  });
  await findHeaderNames([...initialDisplayNames, "Count"]);
}

describe("QueryBuilder > summarize > multiple breakouts of one column", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it.each(BREAKOUTS_CASES)(
    "should change the bucket of each $title breakout from the summarize sidebar",
    async (testCase) => {
      await setupBreakoutsCard(testCase);
      setupDatasetEndpoint([
        {
          stage: { breakout: [testCase.breakout1, testCase.breakout2] },
          dataset: createBreakoutsDataset(
            testCase.column,
            testCase.finalDisplayNames,
            testCase.finalRow,
          ),
        },
      ]);
      await openSummarySidebar();
      expect(getChipLabels("columns")).toEqual(testCase.initialDisplayNames);

      const firstStage = await waitForDatasetRequest(() =>
        changeGroupingBucket(testCase.chip1Name, testCase.bucket1Name),
      );
      expect(firstStage).toEqual(
        expect.objectContaining({
          "source-table": testCase.sourceTableId,
          breakout: [testCase.breakout1, testCase.initialBreakout2],
        }),
      );

      const secondChipName = getChipLabels("columns")[1];
      expect(secondChipName).toBe(testCase.chip2Name);
      const secondStage = await waitForDatasetRequest(() =>
        changeGroupingBucket(testCase.chip2Name, testCase.bucket2Name),
      );
      expect(secondStage).toEqual(
        expect.objectContaining({
          "source-table": testCase.sourceTableId,
          aggregation: [["count", expect.anything()]],
          breakout: [testCase.breakout1, testCase.breakout2],
        }),
      );
      expect(getChipLabels("columns")).toEqual(testCase.finalDisplayNames);
      await findHeaderNames([...testCase.finalDisplayNames, "Count"]);
    },
  );

  it("should use the first breakout of the column for the timeseries chrome", async () => {
    const [temporalCase] = BREAKOUTS_CASES;
    await setupBreakoutsCard(temporalCase);
    const quarterBreakout = temporalBreakout(ORDERS.CREATED_AT, "quarter");
    const monthBreakout = temporalBreakout(ORDERS.CREATED_AT, "month");
    const createdAtFilter = (date: string) => [
      "=",
      expect.anything(),
      ["field", expect.anything(), ORDERS.CREATED_AT],
      date,
    ];
    const quarterDataset = (row: RowValue[]) =>
      createBreakoutsDataset(
        temporalCase.column,
        ["Created At: Quarter", "Created At: Month"],
        row,
      );
    setupDatasetEndpoint([
      {
        stage: {
          breakout: [quarterBreakout, monthBreakout],
          filters: [createdAtFilter("2028-08-14")],
        },
        dataset: quarterDataset([
          "2028-07-01T00:00:00Z",
          "2028-08-01T00:00:00Z",
          14,
        ]),
      },
      {
        stage: {
          breakout: [quarterBreakout, monthBreakout],
          filters: [createdAtFilter("2025-08-14")],
        },
        dataset: quarterDataset([
          "2025-07-01T00:00:00Z",
          "2025-08-01T00:00:00Z",
          1,
        ]),
      },
      {
        stage: { breakout: [quarterBreakout, monthBreakout] },
        dataset: quarterDataset([
          "2025-04-01T00:00:00Z",
          "2025-04-01T00:00:00Z",
          1,
        ]),
      },
    ]);

    const bucketButton = await screen.findByTestId("timeseries-bucket-button");
    expect(bucketButton).toHaveTextContent("Year");
    const bucketStage = await waitForDatasetRequest(async () => {
      await userEvent.click(bucketButton);
      await userEvent.click(await screen.findByText("Quarter"));
    });
    expect(bucketStage).toEqual(
      expect.objectContaining({ breakout: [quarterBreakout, monthBreakout] }),
    );
    expect(bucketStage).not.toHaveProperty("filters");
    await findHeaderNames([
      "Created At: Quarter",
      "Created At: Month",
      "Count",
    ]);
    expect(await screen.findByText("Q2 2025")).toBeInTheDocument();

    const filterButton = screen.getByTestId("timeseries-filter-button");
    expect(filterButton).toHaveTextContent("All time");
    const filterStage = await waitForDatasetRequest(async () => {
      await userEvent.click(filterButton);
      await userEvent.click(await screen.findByDisplayValue("All time"));
      await userEvent.click(await screen.findByText("On"));
      const dateInput = await screen.findByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "August 14, 2028");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    });
    expect(filterStage).toEqual(
      expect.objectContaining({
        breakout: [quarterBreakout, monthBreakout],
        filters: [createdAtFilter("2028-08-14")],
      }),
    );
    expect(await screen.findByText("Q3 2028")).toBeInTheDocument();
    expect(screen.getByText("August 2028")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("timeseries-filter-button")).toHaveTextContent(
        "Aug 14",
      ),
    );
    const changedFilterStage = await waitForDatasetRequest(async () => {
      await userEvent.click(screen.getByTestId("timeseries-filter-button"));
      const dateInput = await screen.findByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "August 14, 2025");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    });
    expect(changedFilterStage).toEqual(
      expect.objectContaining({
        breakout: [quarterBreakout, monthBreakout],
        filters: [createdAtFilter("2025-08-14")],
      }),
    );
    expect(await screen.findByText("Q3 2025")).toBeInTheDocument();
    expect(screen.getByText("August 2025")).toBeInTheDocument();
  });

  it.each(BREAKOUTS_CASES)(
    "should rename each $title breakout from its column header",
    async (testCase) => {
      await setupBreakoutsCard(testCase);
      const [column1Name, column2Name] = testCase.initialDisplayNames;

      await renameColumn(column1Name, "Breakout1");
      await findHeaderNames(["Breakout1", column2Name, "Count"]);

      await renameColumn(column2Name, "Breakout2");
      await findHeaderNames(["Breakout1", "Breakout2", "Count"]);
      expect(
        screen.queryByRole("columnheader", { name: column1Name }),
      ).not.toBeInTheDocument();
    },
  );
});

async function renameColumn(columnName: string, newName: string) {
  const headerCell = screen.getByRole("columnheader", { name: columnName });
  await userEvent.click(within(headerCell).getByText(columnName));
  const clickActions = await screen.findByTestId("click-actions-view");
  await userEvent.click(
    within(clickActions).getByRole("button", { name: /gear icon/i }),
  );
  const settings = await screen.findByTestId("column-formatting-settings");
  const titleInput = within(settings).getByDisplayValue(columnName);
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, newName);
  await userEvent.tab();
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByTestId("column-formatting-settings"),
    ).not.toBeInTheDocument(),
  );
}

describe("QueryBuilder > summarize > a sorted aggregation", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("should drop the sort with the sorted aggregation, then remove another aggregation (metabase#12625)", async () => {
    const sumOfSubtotal: TestAggregationSpec = {
      type: "operator",
      operator: "sum",
      args: [{ type: "column", name: "SUBTOTAL" }],
    };
    const sumOfTotal: TestAggregationSpec = {
      type: "operator",
      operator: "sum",
      args: [{ type: "column", name: "TOTAL" }],
    };
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [COUNT, sumOfSubtotal, sumOfTotal],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
        },
      ],
    });
    // the test query spec cannot tell the two `sum` columns apart by name
    const sortedColumn = checkNotNull(
      Lib.orderableColumns(query, -1).find(
        (column) =>
          Lib.displayInfo(query, -1, column).displayName === "Sum of Subtotal",
      ),
    );
    const card = createMockCard({
      id: 1,
      name: "12625",
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.orderBy(query, -1, sortedColumn, "desc"),
      ),
    });
    const createdAtColumn = createBreakoutColumn(
      createOrdersCreatedAtDatasetColumn(),
      0,
      "Created At: Year",
    );
    const sumColumn = (name: string, displayName: string, index: number) =>
      createMockColumn({
        name,
        display_name: displayName,
        base_type: "type/Float",
        effective_type: "type/Float",
        source: "aggregation",
        field_ref: ["aggregation", index],
      });
    await setup({
      card,
      dataset: createDataset(
        [
          createdAtColumn,
          COUNT_COLUMN,
          sumColumn("sum", "Sum of Subtotal", 1),
          sumColumn("sum_2", "Sum of Total", 2),
        ],
        [["2028-01-01T00:00:00Z", 6578, 503500, 559000]],
      ),
      database: createSampleDatabase({ auto_run_queries: true }),
    });
    const sumOfSubtotalClause = [
      "sum",
      expect.anything(),
      ["field", expect.anything(), ORDERS.SUBTOTAL],
    ];
    const sumOfTotalClause = [
      "sum",
      expect.anything(),
      ["field", expect.anything(), ORDERS.TOTAL],
    ];
    const countClause = ["count", expect.anything()];
    setupDatasetEndpoint([
      {
        stage: { aggregation: [countClause, sumOfTotalClause] },
        dataset: createDataset(
          [createdAtColumn, COUNT_COLUMN, sumColumn("sum", "Sum of Total", 1)],
          [["2028-01-01T00:00:00Z", 6578, 559000]],
        ),
      },
      {
        stage: { aggregation: [countClause] },
        dataset: createDataset(
          [createdAtColumn, COUNT_COLUMN],
          [["2025-01-01T00:00:00Z", 744]],
        ),
      },
    ]);

    await findHeaderNames([
      "Created At: Year",
      "Count",
      "Sum of Subtotal",
      "Sum of Total",
    ]);
    const sortIndicators = screen.getAllByTestId("header-sort-indicator");
    expect(sortIndicators).toHaveLength(1);
    expect(
      within(
        screen.getByRole("columnheader", { name: /Sum of Subtotal/ }),
      ).getByTestId("header-sort-indicator"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("columnheader", { name: /Sum of Subtotal/ }),
      ).getByLabelText("chevrondown icon"),
    ).toBeInTheDocument();

    await openSummarySidebar();
    expect(getChipLabels("values")).toEqual([
      "Count",
      "Sum of Subtotal",
      "Sum of Total",
    ]);
    const firstStage = await waitForDatasetRequest(() =>
      userEvent.click(screen.getByLabelText("Remove Sum of Subtotal")),
    );
    expect(firstStage).toEqual(
      expect.objectContaining({
        aggregation: [countClause, sumOfTotalClause],
      }),
    );
    expect(firstStage).not.toHaveProperty("order-by");
    expect(firstStage).toEqual(
      expect.not.objectContaining({
        aggregation: expect.arrayContaining([sumOfSubtotalClause]),
      }),
    );
    await findHeaderNames(["Created At: Year", "Count", "Sum of Total"]);
    expect(
      screen.queryByTestId("header-sort-indicator"),
    ).not.toBeInTheDocument();
    expect(getChipLabels("values")).toEqual(["Count", "Sum of Total"]);

    const secondStage = await waitForDatasetRequest(() =>
      userEvent.click(screen.getByLabelText("Remove Sum of Total")),
    );
    expect(secondStage).toEqual(
      expect.objectContaining({ aggregation: [countClause] }),
    );
    expect(secondStage).not.toHaveProperty("order-by");
    await findHeaderNames(["Created At: Year", "Count"]);
    expect(getChipLabels("values")).toEqual(["Count"]);
    expect(screen.getByText("744")).toBeInTheDocument();
  });
});
