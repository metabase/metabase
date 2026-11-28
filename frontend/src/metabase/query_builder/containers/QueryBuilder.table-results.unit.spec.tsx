import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  DatasetQuery,
  Field,
  RowValue,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockFieldValues,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createOrdersTableDatasetColumns,
  createOrdersUserIdDatasetColumn,
  createProductsCategoryDatasetColumn,
  createProductsRatingDatasetColumn,
  createPeopleIdField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getIsRunning } from "../store/selectors";

import { setup } from "./test-utils";

registerVisualizations();

// the field descriptions of the real sample database
const PEOPLE_TABLE = createPeopleTable();
const PEOPLE_FIELDS = checkNotNull(PEOPLE_TABLE.fields).map((field) => {
  if (field.id === PEOPLE.ID) {
    return {
      ...createPeopleIdField(),
      description: "A unique identifier given to each user.",
    };
  }
  if (field.id === PEOPLE.CITY) {
    return {
      ...field,
      description: "The city of the account’s billing address",
    };
  }
  return field;
});

const DATABASE = createSampleDatabase({
  auto_run_queries: true,
  tables: [
    createOrdersTable(),
    { ...PEOPLE_TABLE, fields: PEOPLE_FIELDS },
    createProductsTable(),
    createReviewsTable(),
  ],
});

const PROVIDER = createMetadataProvider({
  metadata: createMockMetadata({ databases: [DATABASE] }),
});

const RESULTS_TIMEZONE = "America/Los_Angeles";

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const ORDERS_COLUMNS_BY_DISPLAY_NAME = Object.fromEntries(
  createOrdersTableDatasetColumns().map((col) => [col.display_name, col]),
);

function getRequestQuery(call: CallLog) {
  return Lib.fromJsQuery(PROVIDER, JSON.parse(String(call.options.body)));
}

function getReturnedColumnNames(query: Lib.Query) {
  return Lib.returnedColumns(query, -1).map(
    (column) => Lib.displayInfo(query, -1, column).longDisplayName,
  );
}

/**
 * Returns the columns that the query asks for, in the order of the query, as
 * the backend does. A column that the test does not know fails the test.
 */
function createDatasetForQuery(
  datasetQuery: DatasetQuery,
  columnsByName: Record<string, DatasetColumn>,
  rows: Record<string, RowValue>[],
) {
  const query = Lib.fromJsQuery(PROVIDER, datasetQuery);
  const names = getReturnedColumnNames(query);
  const cols = names.map((name) => {
    const col = columnsByName[name];
    if (col == null) {
      throw new Error(`Unknown column: ${name}`);
    }
    return col;
  });
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: rows.length,
    json_query: datasetQuery,
    data: {
      cols,
      rows: rows.map((row) => names.map((name) => row[name] ?? null)),
      results_timezone: RESULTS_TIMEZONE,
    },
  });
}

function setupDatasetEndpoint(
  columnsByName: Record<string, DatasetColumn>,
  rows: Record<string, RowValue>[],
) {
  // registered before `setup` does, so this route answers the runs
  fetchMock.post("path:/api/dataset", (call) =>
    createDatasetForQuery(
      JSON.parse(String(call.options.body)),
      columnsByName,
      rows,
    ),
  );
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" });
}

function createFieldColumn(field: Field): DatasetColumn {
  return createMockColumn({
    ...field,
    id: Number(field.id),
    source: "fields",
    field_ref: ["field", Number(field.id), { "base-type": field.base_type }],
  });
}

const getPeopleField = (id: number) =>
  checkNotNull(PEOPLE_FIELDS.find((field) => field.id === id));

/**
 * Stands in for GET /api/field/:id, as the column hovercard loads the field to
 * show its distinct count. Unknown ids get a 404.
 */
function setupFieldEndpoints() {
  fetchMock.get("express:/api/field/:id", (call) => {
    const id = Number(new URL(call.url).pathname.split("/").at(-1));
    const field = PEOPLE_FIELDS.find((field) => field.id === id);
    return field ?? { status: 404 };
  });
  fetchMock.get(
    `path:/api/field/${PEOPLE.STATE}/values`,
    createMockFieldValues({
      field_id: PEOPLE.STATE,
      values: [["AK"], ["AL"], ["AR"], ["AZ"]],
    }),
  );
}

async function hoverHeader(name: string) {
  const header = await screen.findByRole("columnheader", { name });
  await userEvent.hover(within(header).getByText(name));
  return screen.findByTestId("column-info", {}, { timeout: 3000 });
}

async function unhoverHeader(name: string) {
  const header = screen.getByRole("columnheader", { name });
  await userEvent.unhover(within(header).getByText(name));
  await waitFor(() =>
    expect(screen.queryByTestId("column-info")).not.toBeInTheDocument(),
  );
}

describe("QueryBuilder > table results", () => {
  beforeEach(() => {
    // the data grid virtualizes its columns and renders none at zero size
    mockGetBoundingClientRect({ width: 4000, height: 800 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("column metadata hovercards", () => {
    const CC_NAME = "Foo";
    const PEOPLE_COLUMN_NAMES = [
      "ID",
      "City",
      "State",
      "Birth Date",
      "Latitude",
    ];

    const peopleCard = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PEOPLE_ID },
              expressions: [
                {
                  name: CC_NAME,
                  value: {
                    type: "operator",
                    operator: "concat",
                    args: [
                      { type: "column", name: "NAME" },
                      { type: "column", name: "NAME" },
                    ],
                  },
                },
              ],
              fields: [
                { type: "column", name: "ID" },
                { type: "column", name: "CITY" },
                { type: "column", name: "STATE" },
                { type: "column", name: "BIRTH_DATE" },
                { type: "column", name: "LATITUDE" },
              ],
              limit: 2,
            },
          ],
        }),
      ),
    });

    const CC_COLUMN = createMockColumn({
      name: CC_NAME,
      display_name: CC_NAME,
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: null,
      source: "fields",
      field_ref: ["expression", CC_NAME],
    });
    const COUNT_COLUMN = createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      semantic_type: "type/Quantity",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });
    const COLUMNS_BY_NAME: Record<string, DatasetColumn> = {
      ID: createFieldColumn(getPeopleField(PEOPLE.ID)),
      City: createFieldColumn(getPeopleField(PEOPLE.CITY)),
      State: createFieldColumn(getPeopleField(PEOPLE.STATE)),
      "Birth Date": createFieldColumn(getPeopleField(PEOPLE.BIRTH_DATE)),
      Latitude: createFieldColumn(getPeopleField(PEOPLE.LATITUDE)),
      [CC_NAME]: CC_COLUMN,
      Count: COUNT_COLUMN,
    };
    const ROW: Record<string, RowValue> = {
      ID: 1,
      City: "Wood River",
      State: "NE",
      "Birth Date": "1986-12-12",
      Latitude: 40.71,
      [CC_NAME]: "Hudson BorerHudson Borer",
      Count: 1,
    };

    it("should show field metadata in a hovercard when hovering over a table column header", async () => {
      setupDatasetEndpoint(COLUMNS_BY_NAME, [ROW]);
      setupFieldEndpoints();
      await setup({ card: peopleCard, database: DATABASE });
      await screen.findByRole("columnheader", { name: CC_NAME });
      expect(
        getReturnedColumnNames(getRequestQuery(getDatasetCalls()[0])),
      ).toEqual([...PEOPLE_COLUMN_NAMES, CC_NAME]);

      let card = await hoverHeader("ID");
      expect(within(card).getByText("Entity Key")).toBeInTheDocument();
      expect(
        within(card).getByText("A unique identifier given to each user."),
      ).toBeInTheDocument();
      await unhoverHeader("ID");

      card = await hoverHeader("City");
      expect(within(card).getByText("City")).toBeInTheDocument();
      expect(
        within(card).getByText("The city of the account’s billing address"),
      ).toBeInTheDocument();
      expect(
        await within(card).findByText("1,966 distinct values"),
      ).toBeInTheDocument();
      await unhoverHeader("City");

      card = await hoverHeader("State");
      expect(within(card).getByText("State")).toBeInTheDocument();
      expect(
        await within(card).findByText("49 distinct values"),
      ).toBeInTheDocument();
      expect(await within(card).findByText(/AK, AL, AR/)).toBeInTheDocument();
      await unhoverHeader("State");

      card = await hoverHeader("Birth Date");
      expect(within(card).getByText("No special type")).toBeInTheDocument();
      expect(within(card).getByText("Timezone")).toBeInTheDocument();
      expect(within(card).getByText(RESULTS_TIMEZONE)).toBeInTheDocument();
      expect(
        within(card).getByText("April 26, 1958, 12:00 AM"),
      ).toBeInTheDocument();
      expect(
        within(card).getByText("April 3, 2000, 12:00 AM"),
      ).toBeInTheDocument();
      await unhoverHeader("Birth Date");

      card = await hoverHeader("Latitude");
      expect(within(card).getByText("Latitude")).toBeInTheDocument();
      expect(within(card).getByText("39.88")).toBeInTheDocument();
      expect(within(card).getByText("25.78")).toBeInTheDocument();
      expect(within(card).getByText("70.64")).toBeInTheDocument();
      await unhoverHeader("Latitude");

      card = await hoverHeader(CC_NAME);
      expect(within(card).getByText("No special type")).toBeInTheDocument();
      expect(within(card).getByText("No description")).toBeInTheDocument();
      await unhoverHeader(CC_NAME);

      // group by the custom column in the summarize sidebar
      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Summarize/,
        }),
      );
      const fieldList = await screen.findByTestId("summary-field-list");
      const runCount = getDatasetCalls().length;
      await userEvent.click(
        within(fieldList).getByRole("button", { name: CC_NAME }),
      );
      await waitFor(() =>
        expect(getDatasetCalls().length).toBeGreaterThan(runCount),
      );
      await act(() => fetchMock.callHistory.flush(true));
      const summarizedQuery = getRequestQuery(
        checkNotNull(getDatasetCalls().at(-1)),
      );
      expect(getReturnedColumnNames(summarizedQuery)).toEqual([
        CC_NAME,
        "Count",
      ]);

      card = await hoverHeader("Count");
      expect(within(card).getByText("Quantity")).toBeInTheDocument();
      expect(within(card).getByText("No description")).toBeInTheDocument();
      await unhoverHeader("Count");

      card = await hoverHeader(CC_NAME);
      expect(within(card).getByText("No special type")).toBeInTheDocument();
      expect(within(card).getByText("No description")).toBeInTheDocument();
    });
  });

  describe("foreign key metadata", () => {
    const ordersCard = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID }, limit: 2 }],
        }),
      ),
    });
    const ORDERS_COLUMNS_BY_NAME = Object.fromEntries(
      createOrdersTableDatasetColumns().map((col) => [
        col.display_name,
        col.name === "PRODUCT_ID"
          ? { ...col, description: "The product ID." }
          : col,
      ]),
    );

    it("should show foreign key metadata, close the header popover with Escape, and show metadata in the summarize sidebar (metabase#19577, metabase#55673)", async () => {
      setupDatasetEndpoint(ORDERS_COLUMNS_BY_NAME, [
        { ID: 1, "Product ID": 14 },
        { ID: 2, "Product ID": 123 },
      ]);
      await setup({ card: ordersCard, database: DATABASE });

      const card = await hoverHeader("Product ID");
      expect(within(card).getByText("Foreign Key")).toBeInTheDocument();
      expect(within(card).getByText("The product ID.")).toBeInTheDocument();
      await unhoverHeader("Product ID");

      const header = screen.getByRole("columnheader", { name: "Product ID" });
      await userEvent.click(within(header).getByText("Product ID"));
      const clickActions = await screen.findByTestId("click-actions-view");
      await waitFor(() =>
        expect(
          within(clickActions).getByTestId(
            "click-actions-sort-control-sort.ascending",
          ),
        ).toHaveFocus(),
      );
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("click-actions-view"),
        ).not.toBeInTheDocument(),
      );

      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Summarize/,
        }),
      );
      const ordersSection = await within(
        await screen.findByTestId("summary-field-list"),
      ).findByRole("region", { name: "Orders" });
      const idField = within(ordersSection).getByRole("button", {
        name: "ID",
      });
      await userEvent.hover(within(idField).getByLabelText("More info"));
      const fieldCard = await screen.findByTestId(
        "column-info",
        {},
        { timeout: 3000 },
      );
      expect(within(fieldCard).getByText("Entity Key")).toBeInTheDocument();
    });
  });

  describe("native query metadata", () => {
    const NATIVE_CARD = createMockCard({
      id: 72,
      name: "Products",
      display: "table",
      query_type: "native",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(PROVIDER, {
          query: "select * from products limit 1",
        }),
      ),
    });
    const NATIVE_COLUMNS = ["ID", "TITLE", "CATEGORY"].map((name) =>
      createMockColumn({
        // a native column has no field id
        id: undefined,
        name,
        display_name: name,
        source: "native",
        base_type: name === "ID" ? "type/BigInteger" : "type/Text",
        effective_type: name === "ID" ? "type/BigInteger" : "type/Text",
        semantic_type: null,
        field_ref: ["field", name, { "base-type": "type/Text" }],
      }),
    );

    it("should show field metadata hovercards for native query tables", async () => {
      await setup({
        card: NATIVE_CARD,
        database: DATABASE,
        dataset: createMockDataset({
          database_id: SAMPLE_DB_ID,
          status: "completed",
          row_count: 1,
          data: {
            cols: NATIVE_COLUMNS,
            rows: [[1, "Rustic Paper Wallet", "Gizmo"]],
          },
        }),
      });
      expect(
        await within(screen.getByTestId("table-root")).findByText("Gizmo"),
      ).toBeInTheDocument();

      const card = await hoverHeader("CATEGORY");
      expect(within(card).getByText("No special type")).toBeInTheDocument();
      expect(within(card).getByText("No description")).toBeInTheDocument();
    });
  });

  describe("slow loading message", () => {
    it("should show the slow loading text when the query is taking too long", async () => {
      const response = defer<Response>();
      fetchMock.post("path:/api/dataset", () => response.promise);
      await setup({
        card: createMockUnsavedCard({
          display: "table",
          dataset_query: Lib.toJsQuery(
            Lib.createTestQuery(PROVIDER, {
              stages: [{ source: { type: "table", id: ORDERS_ID } }],
            }),
          ),
        }),
        database: DATABASE,
      });
      const main = screen.getByTestId("query-builder-main");
      expect(
        await within(main).findByText("Doing science..."),
      ).toBeInTheDocument();
      expect(
        within(main).queryByText("Waiting for results..."),
      ).not.toBeInTheDocument();
      expect(
        await within(main).findByText(
          "Waiting for results...",
          {},
          { timeout: 6000 },
        ),
      ).toBeInTheDocument();
      expect(
        within(main).queryByText("Doing science..."),
      ).not.toBeInTheDocument();

      response.resolve(
        new Response(
          JSON.stringify(
            createDatasetForQuery(
              JSON.parse(String(getDatasetCalls()[0].options.body)),
              ORDERS_COLUMNS_BY_DISPLAY_NAME,
              [{ ID: 1 }],
            ),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await waitFor(() =>
        expect(
          within(main).queryByText("Waiting for results..."),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("automatic pivot", () => {
    const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
    const USER_IDS = [1, 2, 3, 4, 5, 6];
    const RATING_BINS = [0, 1, 2, 3, 4];

    const getHeaderNames = () =>
      within(screen.getByTestId("table-root"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent);

    it("should not crash when the table viz gets automatically pivoted (metabase#45481)", async () => {
      const card = createMockUnsavedCard({
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                ],
                breakouts: [
                  { type: "column", name: "USER_ID" },
                  {
                    type: "column",
                    name: "CATEGORY",
                    sourceFieldId: ORDERS.PRODUCT_ID,
                  },
                ],
              },
            ],
          }),
        ),
      });
      setupDatasetEndpoint(
        {
          "User ID": createOrdersUserIdDatasetColumn({ source: "breakout" }),
          "Product → Category": createProductsCategoryDatasetColumn({
            display_name: "Product → Category",
            source: "breakout",
            fk_field_id: ORDERS.PRODUCT_ID,
            field_ref: [
              "field",
              PRODUCTS.CATEGORY,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          }),
          Count: COUNT_COLUMN,
        },
        // more users than categories, as in the sample database, so that
        // the table pivots on the category
        USER_IDS.flatMap((userId) =>
          CATEGORIES.map((category, index) => ({
            "User ID": userId,
            "Product → Category": category,
            Count: userId + index,
          })),
        ),
      );
      await setup({
        card,
        database: DATABASE,
        initialRoute: `/question/notebook#${serializeCardForUrl(card)}`,
      });

      await userEvent.click(
        await screen.findByRole("button", { name: "Visualize" }),
      );
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
      expect(
        getReturnedColumnNames(getRequestQuery(getDatasetCalls()[0])),
      ).toEqual(["User ID", "Product → Category", "Count"]);

      await waitFor(() => expect(getHeaderNames()).toContain("Doohickey"));
      expect(getHeaderNames()).toContain("Widget");
      expect(getHeaderNames()).not.toContain("Count");
    });

    it("should allow to switch between automatic pivot table and usual table visualization (metabase#56094)", async () => {
      const card = createMockUnsavedCard({
        name: "56094",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(PROVIDER, {
            stages: [
              {
                source: { type: "table", id: PRODUCTS_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                ],
                breakouts: [
                  { type: "column", name: "CATEGORY" },
                  {
                    type: "column",
                    name: "RATING",
                    binning: { strategy: "default" },
                  },
                ],
                limit: 20,
              },
            ],
          }),
        ),
      });
      setupDatasetEndpoint(
        {
          Category: createProductsCategoryDatasetColumn({
            source: "breakout",
          }),
          "Rating: Auto binned": createProductsRatingDatasetColumn({
            source: "breakout",
            binning_info: {
              binning_strategy: "num-bins",
              bin_width: 1,
              num_bins: 8,
              min_value: 0,
              max_value: 5,
            },
            field_ref: [
              "field",
              PRODUCTS.RATING,
              { binning: { strategy: "num-bins", "num-bins": 8 } },
            ],
          }),
          Count: COUNT_COLUMN,
        },
        // more rating bins than categories, as in the sample database
        RATING_BINS.flatMap((rating) =>
          CATEGORIES.map((category, index) => ({
            Category: category,
            "Rating: Auto binned": rating,
            Count: rating + index,
          })),
        ),
      );
      await setup({ card, database: DATABASE });
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
      expect(
        getReturnedColumnNames(getRequestQuery(getDatasetCalls()[0])),
      ).toEqual(["Category", "Rating: Auto binned", "Count"]);

      await waitFor(() => expect(getHeaderNames()).toContain("Doohickey"));
      expect(getHeaderNames()).not.toContain("Count");

      const footer = screen.getByTestId("view-footer");
      await userEvent.click(within(footer).getByLabelText("Switch to data"));
      expect(
        within(footer).getByTestId("query-display-tabular-toggle"),
      ).toBeInTheDocument();
      await waitFor(() => expect(getHeaderNames()).toContain("Count"));
      expect(getHeaderNames()).not.toContain("Doohickey");

      await userEvent.click(
        within(footer).getByLabelText("Switch to visualization"),
      );
      expect(
        within(footer).getByTestId("query-display-tabular-toggle"),
      ).toBeInTheDocument();
      await waitFor(() => expect(getHeaderNames()).toContain("Doohickey"));
      expect(getHeaderNames()).not.toContain("Count");
    });
  });

  describe("removing a breakout", () => {
    const PEOPLE_COLUMNS_BY_NAME = {
      Name: createFieldColumn(getPeopleField(PEOPLE.NAME)),
      Source: createFieldColumn(getPeopleField(PEOPLE.SOURCE)),
      Count: COUNT_COLUMN,
    };
    const PEOPLE_ROWS = [
      { Name: "Aaron Hand", Source: "Facebook", Count: 1 },
      { Name: "Abbey Satterfield", Source: "Affiliate", Count: 1 },
      { Name: "Abdullah Ortiz", Source: "Facebook", Count: 1 },
    ];

    it("should not keep orphan columns rendered after switching from pivot to regular table (metabase#18817)", async () => {
      const card = createMockCard({
        id: 18817,
        name: "18817",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(PROVIDER, {
            stages: [
              {
                source: { type: "table", id: PEOPLE_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                ],
                breakouts: [
                  { type: "column", name: "NAME" },
                  { type: "column", name: "SOURCE" },
                ],
                limit: 5,
              },
            ],
          }),
        ),
      });
      setupDatasetEndpoint(PEOPLE_COLUMNS_BY_NAME, PEOPLE_ROWS);
      await setup({
        card,
        database: DATABASE,
        dataset: createDatasetForQuery(
          card.dataset_query,
          PEOPLE_COLUMNS_BY_NAME,
          PEOPLE_ROWS,
        ),
      });
      const getHeaderCellNames = () =>
        within(screen.getByTestId("table-root"))
          .getAllByTestId("header-cell")
          .map((cell) => cell.textContent);
      await waitFor(() => expect(getHeaderCellNames()).toContain("Facebook"));

      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Summarize/,
        }),
      );
      await userEvent.click(await screen.findByLabelText("Remove Source"));
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
      expect(
        getReturnedColumnNames(getRequestQuery(getDatasetCalls()[0])),
      ).toEqual(["Name", "Count"]);

      await waitFor(() =>
        expect(getHeaderCellNames()).toEqual(["Name", "Count"]),
      );
    });
  });

  describe("empty column names", () => {
    const CARD = createMockCard({
      id: 57685,
      name: "57685",
      display: "table",
      query_type: "native",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(PROVIDER, {
          query: 'SELECT id as "" FROM PRODUCTS',
        }),
      ),
    });
    const EMPTY_NAME_COLUMN = createMockColumn({
      name: "",
      display_name: "",
      source: "native",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      field_ref: ["field", "", { "base-type": "type/BigInteger" }],
    });
    const createEmptyNameDataset = (rows: RowValue[][]) =>
      createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: rows.length,
        data: { cols: [EMPTY_NAME_COLUMN], rows },
      });

    it("should handle empty column names without error (metabase#57685)", async () => {
      // the explored question gets its rows only for a query on the saved one
      fetchMock.post("path:/api/dataset", (call) => {
        const body = JSON.parse(String(call.options.body));
        return body.stages?.[0]?.["source-card"] === CARD.id
          ? createEmptyNameDataset([[7], [8]])
          : createEmptyNameDataset([]);
      });
      const { store } = await setup({
        card: CARD,
        database: DATABASE,
        dataset: createEmptyNameDataset([[1], [2]]),
      });
      // `setup` waits for the run to end, so the rows are there
      const root = screen.getByTestId("visualization-root");
      expect(
        within(root).queryByLabelText("warning icon"),
      ).not.toBeInTheDocument();
      expect(within(root).getByText("2")).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("qb-header-action-panel")).getByText(
          "Explore results",
        ),
      );
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
      expect(JSON.parse(String(getDatasetCalls()[0].options.body))).toEqual(
        expect.objectContaining({
          stages: [expect.objectContaining({ "source-card": CARD.id })],
        }),
      );

      await act(() => fetchMock.callHistory.flush(true));
      await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
      const exploredRoot = screen.getByTestId("visualization-root");
      expect(
        within(exploredRoot).queryByLabelText("warning icon"),
      ).not.toBeInTheDocument();
      expect(within(exploredRoot).getByText("8")).toBeInTheDocument();
    });
  });
});
