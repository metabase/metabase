import userEvent from "@testing-library/user-event";
import { getInstanceByDom } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";

import { fireEvent, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";

import { setup } from "./test-utils";

type SetupOpts = Parameters<typeof setup>[0];

/** The e2e instance has x-rays on, which enables the automatic insights drill */
function setupNativeDrills(opts: SetupOpts) {
  return setup({ ...opts, settings: { "enable-xrays": true } });
}

registerVisualizations();

function createNativeColumn(
  name: string,
  baseType: string,
  opts: Partial<DatasetColumn> = {},
): DatasetColumn {
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    name,
    display_name: name,
    source: "native",
    base_type: baseType,
    effective_type: baseType,
    semantic_type: null,
    field_ref: ["field", name, { "base-type": baseType }],
    ...opts,
  });
}

const ID = createNativeColumn("ID", "type/BigInteger");
const CREATED_AT = createNativeColumn("CREATED_AT", "type/DateTime");
const QUANTITY = createNativeColumn("QUANTITY", "type/Integer");
const EMAIL = createNativeColumn("EMAIL", "type/Text");
const PRICE = createNativeColumn("PRICE", "type/Float");
const CATEGORY = createNativeColumn("CATEGORY", "type/Text");

interface NativeCardOpts {
  id: CardId;
  query: string;
  cols: DatasetColumn[];
  display?: Card["display"];
  visualizationSettings?: VisualizationSettings;
}

function createNativeCard({
  id,
  query,
  cols,
  display = "table",
  visualizationSettings = {},
}: NativeCardOpts) {
  return createMockCard({
    id,
    name: "SQL",
    display,
    query_type: "native",
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query }),
    result_metadata: cols,
    visualization_settings: visualizationSettings,
  });
}

function createDataset(cols: DatasetColumn[], rows: RowValue[][]) {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

const ORDERS_COLS = [ID, CREATED_AT, QUANTITY];

const ORDERS_CARD = createNativeCard({
  id: 31,
  query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  cols: ORDERS_COLS,
});

const ORDERS_ROWS: RowValue[][] = [
  [1, "2028-02-11T21:40:27", 2],
  [2, "2027-05-15T08:04:04", 3],
  [3, "2027-09-06T14:18:36", 2],
  [4, "2026-05-31T17:22:22", 6],
  [5, "2027-07-22T10:44:16", 5],
  [6, "2027-11-25T01:45:19", 3],
  [7, "2028-05-08T03:15:04", 5],
  [8, "2028-06-17T02:37:41", 7],
  [9, "2028-04-26T00:27:31", 2],
  [10, "2027-11-26T08:58:01", 3],
];

const ORDERS_DATASET = createDataset(ORDERS_COLS, ORDERS_ROWS);

const PEOPLE_COLS = [ID, EMAIL, CREATED_AT];

const PEOPLE_CARD = createNativeCard({
  id: 47,
  query: "SELECT ID, EMAIL, CREATED_AT FROM PEOPLE ORDER BY ID LIMIT 10",
  cols: PEOPLE_COLS,
});

const PEOPLE_DATASET = createDataset(PEOPLE_COLS, [
  [1, "borer-hudson@yahoo.com", "2026-10-07T01:34:35"],
  [2, "williamson-domenica@yahoo.com", "2027-04-04T23:18:18"],
]);

const TIMESERIES_COLS = [CREATED_AT, QUANTITY];

const TIMESERIES_CARD = createNativeCard({
  id: 58,
  query: "SELECT CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  cols: TIMESERIES_COLS,
  display: "line",
  visualizationSettings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["QUANTITY"],
  },
});

const TIMESERIES_DATASET = createDataset(TIMESERIES_COLS, [
  ["2026-05-31T00:00:00", 6],
  ["2027-05-15T00:00:00", 3],
  ["2028-02-11T00:00:00", 2],
]);

const CATEGORY_COLS = [PRICE, CATEGORY, CREATED_AT];

const CATEGORY_CARD = createNativeCard({
  id: 64,
  query:
    "SELECT PRICE, CATEGORY, CREATED_AT FROM PRODUCTS ORDER BY ID LIMIT 10",
  cols: CATEGORY_COLS,
  display: "line",
  visualizationSettings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["PRICE"],
  },
});

const CATEGORY_DATASET = createDataset(CATEGORY_COLS, [
  [29.46, "Gizmo", "2026-07-19T00:00:00"],
  [70.08, "Doohickey", "2026-04-11T00:00:00"],
  [35.39, "Gadget", "2027-09-08T00:00:00"],
]);

/**
 * True when `actual` has every key of `expected`, recursively. Arrays must have
 * the same length, so an extra clause in the request does not match.
 */
function matchesShape(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matchesShape(actual[index], item))
    );
  }
  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null) {
      return false;
    }
    return Object.entries(expected).every(([key, value]) =>
      matchesShape(Object.getOwnPropertyDescriptor(actual, key)?.value, value),
    );
  }
  return actual === expected;
}

function nativeField(name: string, options: object = {}) {
  return ["field", options, name];
}

function getRunBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

function getRunBodies(): unknown[] {
  return fetchMock.callHistory
    .calls("path:/api/dataset", { method: "POST" })
    .map(getRunBody);
}

/**
 * Answers a run of the drilled question only when its single stage, on top of
 * the saved native question `card`, is `stage`. Any other run fails.
 */
function setupDrillRun(card: Card, stage: object, dataset: Dataset) {
  const expectedBody = {
    stages: [{ "source-card": card.id, ...stage }],
  };
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) =>
      matchesShape(getRunBody(call), expectedBody)
        ? dataset
        : { status: 400, body: { message: "unexpected query" } },
  });
  return expectedBody;
}

async function clickColumnHeader(name: string) {
  const headerCell = await screen.findByRole("columnheader", { name });
  await userEvent.click(within(headerCell).getByText(name));
  return screen.findByTestId("click-actions-view");
}

async function waitForRun(expectedBody: object) {
  await waitFor(() => expect(getRunBodies()).toHaveLength(1));
  expect(getRunBodies()[0]).toMatchObject(expectedBody);
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

/**
 * Clicks a point of the rendered line chart. jsdom has no layout, so the
 * point's position comes from the chart itself.
 */
async function clickChartPoint(point: [string, number]) {
  const chart = await screen.findByTestId("chart-container");
  await waitFor(() => expect(getInstanceByDom(chart)).toBeDefined());
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

describe("QueryBuilder > native query drills", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  describe("column-extract drill", () => {
    const QUARTER_COLUMN = createNativeColumn("Quarter of year", "type/Text", {
      source: "fields",
      field_ref: ["expression", "Quarter of year"],
    });
    const EXTRACT_STAGE = {
      expressions: [
        [
          "quarter-name",
          { "lib/expression-name": "Quarter of year" },
          [
            "get-quarter",
            {},
            nativeField("CREATED_AT", { "base-type": "type/DateTime" }),
          ],
        ],
      ],
    };
    const EXTRACT_DATASET = createDataset(
      [...ORDERS_COLS, QUARTER_COLUMN],
      ORDERS_ROWS.map((row, index) => [...row, `Q${(index % 4) + 1}`]),
    );

    it("should extract a part of a date column from its header", async () => {
      await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
      const expectedBody = setupDrillRun(
        ORDERS_CARD,
        EXTRACT_STAGE,
        EXTRACT_DATASET,
      );

      const popover = await clickColumnHeader("CREATED_AT");
      await userEvent.click(within(popover).getByText("Extract day, month…"));
      await userEvent.click(await screen.findByText("Quarter of year"));

      expect(
        await screen.findByRole("columnheader", { name: "Quarter of year" }),
      ).toBeInTheDocument();
      expect(getRowValues()[1]).toEqual(expect.arrayContaining(["2", "Q2"]));
      await waitForRun(expectedBody);
    });

    it("should extract a part of a date column from the add column button", async () => {
      await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
      const expectedBody = setupDrillRun(
        ORDERS_CARD,
        EXTRACT_STAGE,
        EXTRACT_DATASET,
      );

      await userEvent.click(
        await screen.findByRole("button", { name: "Add column" }),
      );
      await userEvent.click(await screen.findByText("Extract part of column"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("CREATED_AT"),
      );
      await userEvent.click(await screen.findByText("Quarter of year"));

      expect(
        await screen.findByRole("columnheader", { name: "Quarter of year" }),
      ).toBeInTheDocument();
      expect(getRowValues()[1]).toEqual(expect.arrayContaining(["2", "Q2"]));
      await waitForRun(expectedBody);
    });
  });

  it("should filter a numeric column from its header", async () => {
    await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
    expect(await screen.findByText("Showing 10 rows")).toBeInTheDocument();
    const expectedBody = setupDrillRun(
      ORDERS_CARD,
      {
        filters: [
          [
            "between",
            {},
            nativeField("QUANTITY", { "base-type": "type/Integer" }),
            2,
            5,
          ],
        ],
      },
      createDataset(
        ORDERS_COLS,
        ORDERS_ROWS.filter(([, , quantity]) => Number(quantity) <= 5),
      ),
    );

    const popover = await clickColumnHeader("QUANTITY");
    await userEvent.click(within(popover).getByText("Filter by this column"));
    await userEvent.type(await screen.findByPlaceholderText("Min"), "2");
    await userEvent.type(screen.getByPlaceholderText("Max"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(await screen.findByText("Showing 8 rows")).toBeInTheDocument();
    await waitForRun(expectedBody);
  });

  it("should show the distribution of a numeric column from its header", async () => {
    await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
    const binnedQuantity = createNativeColumn("QUANTITY", "type/Integer", {
      display_name: "QUANTITY: 8 bins",
      source: "breakout",
      binning_info: {
        binning_strategy: "num-bins",
        bin_width: 0.75,
        num_bins: 8,
        min_value: 2,
        max_value: 7,
      },
    });
    const count = createNativeColumn("count", "type/BigInteger", {
      display_name: "Count",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });
    const expectedBody = setupDrillRun(
      ORDERS_CARD,
      {
        aggregation: [["count", {}]],
        breakout: [
          nativeField("QUANTITY", {
            "base-type": "type/Integer",
            binning: { strategy: "default" },
          }),
        ],
      },
      createDataset(
        [binnedQuantity, count],
        [
          [2, 3],
          [2.75, 3],
          [5, 2],
          [5.75, 1],
          [7, 1],
        ],
      ),
    );

    const popover = await clickColumnHeader("QUANTITY");
    await userEvent.click(within(popover).getByText("Distribution"));

    const chart = await screen.findByTestId("chart-container");
    await waitFor(() =>
      expect(within(chart).getByText("Count")).toBeInTheDocument(),
    );
    expect(within(chart).getByText("QUANTITY: 8 bins")).toBeInTheDocument();
    expect(screen.getByText("Showing 5 rows")).toBeInTheDocument();
    await waitForRun(expectedBody);
  });

  it.each([
    { direction: "asc", icon: "arrow_up", firstRowId: "9" },
    { direction: "desc", icon: "arrow_down", firstRowId: "8" },
  ])(
    "should sort a column from its header ($direction)",
    async ({ direction, icon, firstRowId }) => {
      await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
      const sign = direction === "asc" ? 1 : -1;
      // ties come back in descending id order, so the first row is not the
      // first row of the unsorted results
      const sortedRows = [...ORDERS_ROWS].sort(
        ([idA, , quantityA], [idB, , quantityB]) =>
          sign * (Number(quantityA) - Number(quantityB)) ||
          Number(idB) - Number(idA),
      );
      const expectedBody = setupDrillRun(
        ORDERS_CARD,
        {
          "order-by": [
            [
              direction,
              {},
              nativeField("QUANTITY", { "base-type": "type/Integer" }),
            ],
          ],
        },
        createDataset(ORDERS_COLS, sortedRows),
      );

      const popover = await clickColumnHeader("QUANTITY");
      await userEvent.click(within(popover).getByLabelText(`${icon} icon`));

      await waitForRun(expectedBody);
      await waitFor(() => expect(getRowValues()[0][0]).toBe(firstRowId));
    },
  );

  it.each([
    {
      action: "Distinct values",
      operator: "distinct",
      columnName: "Distinct values of QUANTITY",
      value: 5,
    },
    {
      action: "Sum",
      operator: "sum",
      columnName: "Sum of QUANTITY",
      value: 38,
    },
    {
      action: "Avg",
      operator: "avg",
      columnName: "Average of QUANTITY",
      value: 3.8,
    },
  ])(
    "should summarize a column from its header ($operator)",
    async ({ action, operator, columnName, value }) => {
      await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
      const expectedBody = setupDrillRun(
        ORDERS_CARD,
        {
          aggregation: [
            [
              operator,
              {},
              nativeField("QUANTITY", { "base-type": "type/Integer" }),
            ],
          ],
        },
        createDataset(
          [
            createNativeColumn(operator, "type/Float", {
              display_name: columnName,
              source: "aggregation",
              field_ref: ["aggregation", 0],
            }),
          ],
          [[value]],
        ),
      );

      const popover = await clickColumnHeader("QUANTITY");
      await userEvent.click(within(popover).getByText(action));

      expect(
        await screen.findByRole("columnheader", { name: columnName }),
      ).toBeInTheDocument();
      expect(screen.getByText(String(value))).toBeInTheDocument();
      await waitForRun(expectedBody);
    },
  );

  it("should summarize a column over time from its header", async () => {
    await setupNativeDrills({ card: ORDERS_CARD, dataset: ORDERS_DATASET });
    const expectedBody = setupDrillRun(
      ORDERS_CARD,
      {
        aggregation: [
          ["sum", {}, nativeField("QUANTITY", { "base-type": "type/Integer" })],
        ],
        breakout: [
          nativeField("CREATED_AT", {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          }),
        ],
      },
      createDataset(
        [
          createNativeColumn("CREATED_AT", "type/DateTime", {
            display_name: "CREATED_AT: Month",
            source: "breakout",
            unit: "month",
          }),
          createNativeColumn("sum", "type/BigInteger", {
            display_name: "Sum of QUANTITY",
            source: "aggregation",
            field_ref: ["aggregation", 0],
          }),
        ],
        [
          ["2026-05-01T00:00:00", 3],
          ["2027-05-01T00:00:00", 3],
          ["2027-09-01T00:00:00", 5],
        ],
      ),
    );

    const popover = await clickColumnHeader("QUANTITY");
    await userEvent.click(within(popover).getByText("Sum over time"));

    expect(await screen.findByText("Showing 3 rows")).toBeInTheDocument();
    await waitForRun(expectedBody);
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["CREATED_AT: Month", "Sum of QUANTITY"]);
    expect(getRowValues()).toEqual([
      ["May 2026", "3"],
      ["May 2027", "3"],
      ["September 2027", "5"],
    ]);
  });

  describe("combine-columns drill", () => {
    function createCombinedDataset(name: string) {
      return createDataset(
        [
          ...PEOPLE_COLS,
          createNativeColumn(name, "type/Text", {
            source: "fields",
            field_ref: ["expression", name],
          }),
        ],
        PEOPLE_DATASET.data.rows.map((row) => [...row, `combined ${row[0]}`]),
      );
    }

    it("should combine the clicked column with another one from its header", async () => {
      await setupNativeDrills({ card: PEOPLE_CARD, dataset: PEOPLE_DATASET });
      const name = "Combined EMAIL, ID";
      const expectedBody = setupDrillRun(
        PEOPLE_CARD,
        {
          expressions: [
            [
              "concat",
              { "lib/expression-name": name },
              nativeField("EMAIL", { "base-type": "type/Text" }),
              " ",
              nativeField("ID", { "base-type": "type/BigInteger" }),
            ],
          ],
        },
        createCombinedDataset(name),
      );

      const popover = await clickColumnHeader("EMAIL");
      await userEvent.click(within(popover).getByText("Combine columns"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Done",
        }),
      );

      expect(
        await screen.findByRole("columnheader", { name }),
      ).toBeInTheDocument();
      await waitForRun(expectedBody);
    });

    it("should combine columns from the add column button", async () => {
      await setupNativeDrills({ card: PEOPLE_CARD, dataset: PEOPLE_DATASET });
      const name = "Combined ID, EMAIL";
      const expectedBody = setupDrillRun(
        PEOPLE_CARD,
        {
          expressions: [
            [
              "concat",
              { "lib/expression-name": name },
              nativeField("ID", { "base-type": "type/BigInteger" }),
              " ",
              nativeField("EMAIL", { "base-type": "type/Text" }),
            ],
          ],
        },
        createCombinedDataset(name),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: "Add column" }),
      );
      await userEvent.click(await screen.findByText("Combine columns"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Done",
        }),
      );

      expect(
        await screen.findByRole("columnheader", { name }),
      ).toBeInTheDocument();
      await waitForRun(expectedBody);
    });
  });

  it("should only offer the quick filter drill on a chart point", async () => {
    await setupNativeDrills({
      card: TIMESERIES_CARD,
      dataset: TIMESERIES_DATASET,
    });

    await clickChartPoint(["2027-05-15T00:00:00", 3]);

    const popover = await screen.findByTestId("click-actions-view");
    expect(
      within(popover).getByText("Filter by this value"),
    ).toBeInTheDocument();
    expect(within(popover).queryByText(/See these/)).not.toBeInTheDocument();
    expect(within(popover).queryByText(/See this/)).not.toBeInTheDocument();
    expect(within(popover).queryByText(/Breakout by/)).not.toBeInTheDocument();
    expect(
      within(popover).queryByText(/Automatic insights/),
    ).not.toBeInTheDocument();

    const expectedBody = setupDrillRun(
      TIMESERIES_CARD,
      {
        filters: [
          [
            "=",
            {},
            nativeField("QUANTITY", { "base-type": "type/Integer" }),
            3,
          ],
        ],
      },
      createDataset(TIMESERIES_COLS, [
        ["2027-05-15T00:00:00", 3],
        ["2027-11-25T00:00:00", 3],
        ["2027-11-26T00:00:00", 3],
      ]),
    );
    await userEvent.click(within(popover).getByText("="));

    expect(await screen.findByText("Showing 3 rows")).toBeInTheDocument();
    await waitForRun(expectedBody);
  });

  describe("legend item click", () => {
    async function clickLegendItem(name: string) {
      const legend = await screen.findByLabelText("Legend");
      await userEvent.click(within(legend).getByText(name));
    }

    it("should not open drills on a saved native question", async () => {
      await setupNativeDrills({
        card: CATEGORY_CARD,
        dataset: CATEGORY_DATASET,
      });

      await clickLegendItem("Gadget");

      // the popover opens after the click is handled, so wait for it to have
      // had the chance to open
      await expect(
        screen.findByTestId("click-actions-view", {}, { timeout: 2000 }),
      ).rejects.toThrow();
    });

    it("should offer to save an unsaved native question", async () => {
      const { id, ...unsavedCard } = CATEGORY_CARD;
      await setupNativeDrills({
        card: createMockUnsavedCard(unsavedCard),
        dataset: CATEGORY_DATASET,
      });
      // an unsaved native question does not run when it opens
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      await clickLegendItem("Gadget");

      const popover = await screen.findByTestId("click-actions-view");
      expect(
        within(popover).getByRole("button", { name: "Save" }),
      ).toBeInTheDocument();
      expect(
        within(popover).getByText(/this question to drill-through/),
      ).toBeInTheDocument();
    });
  });
});
