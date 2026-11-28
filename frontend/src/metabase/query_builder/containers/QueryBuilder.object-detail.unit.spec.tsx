import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import {
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { DatasetColumn, Field, RowValue } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  ORDER_QUANTITY_VALUES,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleNameField,
  createPeopleTable,
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
  createProductsEanDatasetColumn,
  createProductsIdDatasetColumn,
  createProductsTitleField,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToFinish } from "./test-utils";

// jsdom gets no class names from CSS modules. Every class name here is its key,
// so a test can see the row the data grid marks as the open one.
jest.mock(
  "metabase/data-grid/components/DataGridRow/DataGridRow.module.css",
  () =>
    new Proxy(
      {},
      { get: (_target, key) => (key === "__esModule" ? false : String(key)) },
    ),
);

registerVisualizations();

function createNativeColumn(name: string, baseType: string): DatasetColumn {
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
  });
}

const ORDERS_COLUMNS = checkNotNull(createOrdersTable().fields).map(
  fieldToColumn,
);

function createOrderRow(id: number, quantity: number): RowValue[] {
  return [
    id,
    1,
    14,
    37.65,
    2.07,
    39.72,
    null,
    "2027-02-11T21:40:27.892Z",
    quantity,
  ];
}

const ORDERS_QUANTITY_INDEX = ORDERS_COLUMNS.findIndex(
  (column) => column.name === "QUANTITY",
);

const ORDER_ROWS = [
  ...Array.from({ length: 6 }, (_, index) => createOrderRow(index + 1, 2)),
  createOrderRow(7, 3),
  createOrderRow(8, 3),
  createOrderRow(9, 4),
];

function getFirstStage(query: unknown): object | null {
  const stages =
    typeof query === "object" && query != null && "stages" in query
      ? query.stages
      : null;
  const stage: unknown = Array.isArray(stages) ? stages[0] : null;
  return typeof stage === "object" ? stage : null;
}

/**
 * The values of the filter on a field in a query, or `null` when the query has
 * no filter with one of `operators` on that field
 */
function getFilterValues(
  query: unknown,
  fieldId: number,
  operators: string[] = ["=", "in"],
): unknown[] | null {
  const stage = getFirstStage(query);
  const filters = stage != null && "filters" in stage ? stage.filters : null;
  if (!Array.isArray(filters)) {
    return null;
  }
  const fieldFilter = filters.find(
    (filter: unknown) =>
      Array.isArray(filter) &&
      operators.includes(filter[0]) &&
      Array.isArray(filter[2]) &&
      filter[2][2] === fieldId,
  );
  return Array.isArray(fieldFilter) ? fieldFilter.slice(3) : null;
}

/** Answers a query with the orders that match its filters on Quantity and ID */
function getOrdersDataset(query: unknown) {
  const quantities = getFilterValues(query, ORDERS.QUANTITY);
  const ids = getFilterValues(query, ORDERS.ID);
  const rows = ORDER_ROWS.filter(
    (row) =>
      (quantities == null || quantities.includes(row[ORDERS_QUANTITY_INDEX])) &&
      (ids == null || ids.includes(row[0])),
  );
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: rows.length,
    data: { cols: ORDERS_COLUMNS, rows },
  });
}

/** Answers a query with the orders whose ID is below the value of its filter */
function getOrdersBelowIdDataset(query: unknown) {
  const [maxId] = getFilterValues(query, ORDERS.ID, ["<"]) ?? [];
  const rows = Array.from({ length: 20 }, (_, index) =>
    createOrderRow(index + 1, 2),
  ).filter(([id]) => typeof maxId === "number" && Number(id) < maxId);
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: rows.length,
    data: { cols: ORDERS_COLUMNS, rows },
  });
}

const JOINED_COLUMNS: DatasetColumn[] = [
  createMockColumn({
    ...fieldToColumn(createProductsTitleField()),
    name: "TITLE",
    display_name: "Products → Title",
    field_ref: ["field", PRODUCTS.TITLE, { "join-alias": "Products" }],
  }),
  createMockColumn({
    ...fieldToColumn(createPeopleNameField()),
    name: "NAME",
    display_name: "People → Name",
    field_ref: ["field", PEOPLE.NAME, { "join-alias": "People" }],
  }),
];

const JOINED_ORDER_ROWS: RowValue[][] = [
  [...createOrderRow(5, 2), "Awesome Concrete Shoes", "Hudson Borer"],
  [...createOrderRow(6, 3), "Mediocre Wooden Bench", "Domenica Williamson"],
];

/** The IDs of the fields that a query picks from its source table, or `null` for all */
function getPickedFieldIds(query: unknown): unknown[] | null {
  const stage = getFirstStage(query);
  const fields = stage != null && "fields" in stage ? stage.fields : null;
  return Array.isArray(fields)
    ? fields.map((field: unknown) =>
        Array.isArray(field) ? field[2] : undefined,
      )
    : null;
}

/** Answers a query of orders with joins, with the order columns it picks */
function getJoinedOrdersDataset(query: unknown) {
  const pickedIds = getPickedFieldIds(query);
  const columnIndexes = ORDERS_COLUMNS.map((_column, index) => index).filter(
    (index) =>
      pickedIds == null || pickedIds.includes(ORDERS_COLUMNS[index].id),
  );
  const joinedIndexes = JOINED_COLUMNS.map(
    (_column, index) => ORDERS_COLUMNS.length + index,
  );
  const indexes = [...columnIndexes, ...joinedIndexes];
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: JOINED_ORDER_ROWS.length,
    data: {
      cols: [
        ...columnIndexes.map((index) => ORDERS_COLUMNS[index]),
        ...JOINED_COLUMNS,
      ],
      rows: JOINED_ORDER_ROWS.map((row) => indexes.map((index) => row[index])),
    },
  });
}

function setupOrdersEndpoint() {
  // registered before `setup` does, so this route answers the runs
  fetchMock.post("path:/api/dataset", (call) =>
    getOrdersDataset(JSON.parse(String(call.options.body))),
  );
}

function getRunQuantityFilterValues() {
  return fetchMock.callHistory
    .calls("path:/api/dataset")
    .map((call) =>
      getFilterValues(JSON.parse(String(call.options.body)), ORDERS.QUANTITY),
    );
}

// the sample database runs a changed query at once
const AUTO_RUN_DATABASE = createSampleDatabase({ auto_run_queries: true });

function fieldToColumn(field: Field): DatasetColumn {
  return createMockColumn({
    ...field,
    id: Number(field.id),
    source: "fields",
    field_ref: ["field", Number(field.id), { "base-type": field.base_type }],
  });
}

const PEOPLE_COLUMNS = checkNotNull(createPeopleTable().fields).map(
  fieldToColumn,
);

const PEOPLE_ROWS: RowValue[][] = [
  [
    1,
    "9611-9809 West Rosedale Road",
    "borer-hudson@yahoo.com",
    "ccca881f-3e4b-4e5c-8336-354103604af6",
    "Hudson Borer",
    "Wood River",
    -98.5259864,
    "NE",
    "Twitter",
    "1986-12-12",
    "68883",
    40.71314890000001,
    "2027-10-07T01:34:35.462Z",
  ],
  [
    2,
    "101 4th Street",
    "williamson-domenica@yahoo.com",
    "eafc45bf-cf8e-4c96-ab35-ce44d0021597",
    "Domenica Williamson",
    "Searsboro",
    -92.6991321,
    "IA",
    "Affiliate",
    "1967-06-10",
    "50242",
    41.5813224,
    "2028-04-09T12:10:05.167Z",
  ],
];

function createPersonRow(id: number): RowValue[] {
  return [
    id,
    `${id} Oak Ridge Parkway`,
    `person-${id}@example.com`,
    `password-${id}`,
    `Person ${id}`,
    "Searsboro",
    -92.6991321,
    "IA",
    "Affiliate",
    "1967-06-10",
    "50242",
    41.5813224,
    "2028-04-09T12:10:05.167Z",
  ];
}

const PEOPLE_DATASET = createMockDataset({
  database_id: SAMPLE_DB_ID,
  status: "completed",
  row_count: PEOPLE_ROWS.length,
  data: { cols: PEOPLE_COLUMNS, rows: PEOPLE_ROWS },
});

const PEOPLE_CARD = createMockUnsavedCard({
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PEOPLE_ID } }],
    }),
  ),
});

const REVIEWS_COLUMNS = checkNotNull(createReviewsTable().fields)
  .map(fieldToColumn)
  .map((column) =>
    column.name === "ID"
      ? {
          ...column,
          // the field settings that the backend sends with the column
          settings: {
            view_as: "link",
            link_text: "Link to review {{ID}}",
            link_url: "https://metabase.test?review={{ID}}",
          },
        }
      : column,
  );

const REVIEWS_ROWS: RowValue[][] = [
  [
    1,
    1,
    "christ",
    5,
    "Ad perspiciatis quis et consectetur.",
    "2026-05-15T20:25:48.517Z",
  ],
  [
    2,
    1,
    "xavier",
    4,
    "Reprehenderit non error architecto consequatur.",
    "2027-01-26T10:51:02.711Z",
  ],
];

const REVIEWS_DATASET = createMockDataset({
  database_id: SAMPLE_DB_ID,
  status: "completed",
  row_count: REVIEWS_ROWS.length,
  data: { cols: REVIEWS_COLUMNS, rows: REVIEWS_ROWS },
});

const REVIEWS_CARD = createMockUnsavedCard({
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: REVIEWS_ID } }],
    }),
  ),
  visualization_settings: {
    column_settings: {
      [JSON.stringify(["name", "RATING"])]: {
        view_as: "link",
        link_text: "Rating: {{RATING}}",
        link_url: "https://metabase.test?rating={{RATING}}",
      },
    },
  },
});

function assertReviewLinks(
  detail: HTMLElement,
  { id, rating }: { id: number; rating: number },
) {
  const reviewLinks = within(detail).getAllByRole("link", {
    name: `Link to review ${id}`,
  });
  expect(reviewLinks).toHaveLength(2);
  reviewLinks.forEach((link) =>
    expect(link).toHaveAttribute("href", `https://metabase.test?review=${id}`),
  );
  expect(
    within(detail).getByRole("link", { name: `Rating: ${rating}` }),
  ).toHaveAttribute("href", `https://metabase.test?rating=${rating}`);
}

/**
 * The data grid renders each row in parts, one for the pinned row index column
 * and one for the other columns. The parts share the dataset index.
 */
function getRowParts(index: number) {
  const parts = screen
    .getAllByRole("row")
    .filter((row) => row.getAttribute("data-index") === String(index));
  if (parts.length === 0) {
    throw new Error(`Row ${index} is not rendered`);
  }
  return parts;
}

/** The part of a row with its row index column */
function getRow(index: number) {
  return getRowParts(index)[0];
}

function getCell(rowIndex: number, columnName: string) {
  const cell = getRowParts(rowIndex)
    .flatMap((part) => within(part).getAllByRole("gridcell"))
    .find((cell) => cell.getAttribute("data-column-id") === columnName);
  if (cell == null) {
    throw new Error(`Cell ${columnName} of row ${rowIndex} is not rendered`);
  }
  return cell;
}

function getDetailShortcutIcon(rowIndex: number) {
  const shortcut = within(getRow(rowIndex)).getByTestId("detail-shortcut");
  return within(shortcut).getByRole("img");
}

/** The values of the detail visualization by their labels */
function getDetailVisualizationValues() {
  const texts = screen
    .getAllByTestId("object-details-table-cell")
    .map((cell) => cell.textContent ?? "");
  return new Map(_.chunk(texts, 2).map(([label, value]) => [label, value]));
}

/** The labels of the detail rows among `labels`, in their order on the page */
function getDetailLabels(detail: HTMLElement, labels: string[]) {
  return within(detail)
    .getAllByText(new RegExp(`^(${labels.join("|")})$`))
    .map((element) => element.textContent);
}

describe("QueryBuilder > object detail", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 4000, height: 800 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("navigates rows with the keyboard, highlights the open row and toggles the details from the row shortcut", async () => {
    await setup({ card: PEOPLE_CARD, dataset: PEOPLE_DATASET });
    await screen.findByText("Domenica Williamson");

    expect(getDetailShortcutIcon(0)).toHaveAttribute(
      "aria-label",
      "sidebar_open icon",
    );
    expect(getRow(0)).not.toHaveClass("active");

    await userEvent.click(within(getRow(0)).getByTestId("detail-shortcut"));
    const detail = await screen.findByTestId("object-detail");
    expect(
      within(detail).getByRole("heading", { name: "Hudson Borer" }),
    ).toBeInTheDocument();
    expect(getRow(0)).toHaveClass("active");
    expect(getRow(1)).not.toHaveClass("active");

    await userEvent.keyboard("{ArrowDown}");
    expect(
      await within(detail).findByRole("heading", {
        name: "Domenica Williamson",
      }),
    ).toBeInTheDocument();
    expect(getRow(1)).toHaveClass("active");
    expect(getRow(0)).not.toHaveClass("active");

    await userEvent.keyboard("{ArrowUp}");
    expect(
      await within(detail).findByRole("heading", { name: "Hudson Borer" }),
    ).toBeInTheDocument();
    expect(getRow(0)).toHaveClass("active");
    expect(getRow(1)).not.toHaveClass("active");

    expect(within(detail).getByLabelText("Previous row")).toBeDisabled();
    await userEvent.keyboard("{ArrowUp}");
    expect(
      within(detail).getByRole("heading", { name: "Hudson Borer" }),
    ).toBeInTheDocument();
    expect(getRow(0)).toHaveClass("active");

    expect(within(detail).getByText("Address")).toBeInTheDocument();
    expect(getDetailLabels(detail, ["Email", "State"])).toEqual([
      "Email",
      "State",
    ]);

    expect(getDetailShortcutIcon(0)).toHaveAttribute(
      "aria-label",
      "sidebar_closed icon",
    );
    await userEvent.hover(within(getRow(0)).getByTestId("detail-shortcut"));
    expect(
      await screen.findByRole("tooltip", { name: "Hide details" }),
    ).toBeInTheDocument();

    await userEvent.click(within(getRow(0)).getByTestId("detail-shortcut"));
    await waitFor(() =>
      expect(screen.queryByTestId("object-detail")).not.toBeInTheDocument(),
    );
    expect(getDetailShortcutIcon(0)).toHaveAttribute(
      "aria-label",
      "sidebar_open icon",
    );
    // the tooltip closes with the click, so hover again
    await userEvent.unhover(within(getRow(0)).getByTestId("detail-shortcut"));
    await userEvent.hover(within(getRow(0)).getByTestId("detail-shortcut"));
    expect(
      await screen.findByRole("tooltip", { name: "View details" }),
    ).toBeInTheDocument();
  });

  it("does not offer drills on the values of a record (metabase#20560)", async () => {
    const { router } = await setup({
      card: PEOPLE_CARD,
      dataset: PEOPLE_DATASET,
    });
    const table = await screen.findByTestId("table-root");

    await userEvent.click(within(table).getByText("Searsboro"));
    expect(await screen.findByTestId("click-actions-view")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("click-actions-view"),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(within(getCell(1, "ID")).getByText("2"));
    const detail = await screen.findByTestId("object-detail");
    expect(router.location.search).toContain("objectId=2");
    expect(
      within(detail).getByRole("heading", { name: "Domenica Williamson" }),
    ).toBeInTheDocument();

    const nameValues = within(detail).getAllByText("Domenica Williamson");
    await userEvent.click(nameValues[nameValues.length - 1]);
    await userEvent.click(within(detail).getByText("Searsboro"));
    // the drills open a while after the click, as in the table above, so wait
    // for them to have had the chance to open
    await expect(
      screen.findByTestId("click-actions-view", {}, { timeout: 2000 }),
    ).rejects.toThrow();
  });

  it("opens the row that was clicked after a vertical and a horizontal scroll (metabase#51301)", async () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      createPersonRow(index + 1),
    );
    await setup({
      card: PEOPLE_CARD,
      dataset: createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: rows.length,
        data: { cols: PEOPLE_COLUMNS, rows },
      }),
    });
    const scrollContainer = await screen.findByTestId("table-scroll-container");

    scrollContainer.scrollTop = 14900;
    scrollContainer.scrollLeft = 2000;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => expect(getRow(417)).toBeInTheDocument());
    await userEvent.click(within(getRow(417)).getByTestId("detail-shortcut"));
    const detail = await screen.findByTestId("object-detail");
    expect(
      within(detail).getByRole("heading", { name: "Person 418" }),
    ).toBeInTheDocument();
    expect(
      within(detail).getByText("418 Oak Ridge Parkway"),
    ).toBeInTheDocument();
    expect(
      within(detail).getByText("person-418@example.com"),
    ).toBeInTheDocument();
  });

  it("renders values as links from the field and the column settings (VIZ-199)", async () => {
    await setup({ card: REVIEWS_CARD, dataset: REVIEWS_DATASET });
    await screen.findByText("Rating: 4");

    await userEvent.click(within(getRow(0)).getByTestId("detail-shortcut"));
    const detail = await screen.findByTestId("object-detail");
    assertReviewLinks(detail, { id: 1, rating: 5 });

    await userEvent.click(within(detail).getByLabelText("Next row"));
    await within(detail).findAllByRole("link", { name: "Link to review 2" });
    assertReviewLinks(detail, { id: 2, rating: 4 });
  });

  it("shows the details-only fields of a question with column settings in the detail view (metabase#32718)", async () => {
    const card = createMockCard({
      id: 1,
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              fields: [
                { type: "column", name: "ID" },
                { type: "column", name: "EAN" },
                { type: "column", name: "CATEGORY" },
                { type: "column", name: "CREATED_AT" },
              ],
              limit: 1,
            },
          ],
        }),
      ),
      visualization_settings: {
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "EAN", enabled: false },
          { name: "CATEGORY", enabled: true },
          { name: "CREATED_AT", enabled: true },
        ],
      },
    });
    const cols = [
      createProductsIdDatasetColumn(),
      createProductsEanDatasetColumn(),
      createProductsCategoryDatasetColumn({
        // the backend marks the column with the visibility of its field
        visibility_type: "details-only",
      }),
      createProductsCreatedAtDatasetColumn(),
    ];
    await setup({
      card,
      dataset: createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 1,
        data: {
          cols,
          rows: [[1, "1018947080336", "Gizmo", "2026-07-19T19:44:56.582Z"]],
        },
      }),
    });

    const table = await screen.findByTestId("table-root");
    expect(within(table).getByText("ID")).toBeInTheDocument();
    expect(within(table).getByText("Created At")).toBeInTheDocument();
    expect(within(table).queryByText("Ean")).not.toBeInTheDocument();
    expect(within(table).queryByText("Category")).not.toBeInTheDocument();
    expect(within(table).queryByText("Gizmo")).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("view-footer")).getByText("Visualization"),
    );
    await userEvent.click(await screen.findByTestId("Detail-button"));

    const detail = await screen.findByTestId("object-detail");
    expect(within(detail).getByText("ID")).toBeInTheDocument();
    expect(within(detail).getByText("Category")).toBeInTheDocument();
    expect(within(detail).getByText("Gizmo")).toBeInTheDocument();
    expect(within(detail).getByText("Created At")).toBeInTheDocument();
    expect(within(detail).queryByText("Ean")).not.toBeInTheDocument();
  });

  it("does not open the detail view from arrow keys after it was closed (metabase#30039)", async () => {
    const cols = [
      createNativeColumn("ID", "type/BigInteger"),
      createNativeColumn("TOTAL", "type/Float"),
    ];
    const card = createMockCard({
      id: 1,
      display: "table",
      query_type: "native",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select * from ORDERS LIMIT 2",
      }),
      result_metadata: cols,
    });
    const { store } = await setup({
      card,
      dataset: createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 2,
        data: {
          cols,
          rows: [
            [1, 39.72],
            [2, 117.03],
          ],
        },
      }),
    });
    await screen.findByText("117.03");

    await userEvent.click(within(getRow(0)).getByTestId("detail-shortcut"));
    expect(await screen.findByTestId("object-detail")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("object-detail")).not.toBeInTheDocument(),
    );

    const editor = within(
      screen.getByTestId("mock-native-query-editor"),
    ).getByRole("textbox");
    await userEvent.type(editor, "{ArrowDown};");
    expect(screen.queryByTestId("object-detail")).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("run-button-overlay")).getByTestId(
        "run-button",
      ),
    );
    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    await waitForQueryToFinish(store);
    expect(screen.queryByTestId("object-detail")).not.toBeInTheDocument();
  });

  it("keeps the filter header usable while the detail view is open (metabase#66957)", async () => {
    setupFieldValuesEndpoint(ORDER_QUANTITY_VALUES);
    setupOrdersEndpoint();
    const card = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });
    await setup({
      card,
      database: AUTO_RUN_DATABASE,
      dataset: getOrdersDataset(card.dataset_query),
    });
    await screen.findByText("Showing 9 rows");

    await userEvent.click(
      within(screen.getByTestId("table-root")).getByText("Quantity"),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Filter by this column/ }),
    );
    const addPopover = await screen.findByTestId("number-filter-picker");
    await userEvent.click(await within(addPopover).findByLabelText("2"));
    await userEvent.click(
      within(addPopover).getByRole("button", { name: "Add filter" }),
    );
    expect(await screen.findByText("Showing 6 rows")).toBeInTheDocument();

    await userEvent.click(within(getRow(5)).getByTestId("detail-shortcut"));
    const detail = await screen.findByTestId("object-detail");
    expect(
      within(detail).getByRole("heading", { name: "6" }),
    ).toBeInTheDocument();

    const filtersPanel = screen.getByTestId("qb-filters-panel");
    await userEvent.click(
      within(filtersPanel).getByText("Quantity is equal to 2"),
    );
    const popover = await screen.findByRole("dialog", {
      name: /Quantity/,
    });
    await userEvent.click(within(popover).getByLabelText("3"));
    await userEvent.click(
      within(popover).getByRole("button", { name: "Update filter" }),
    );

    expect(
      await within(screen.getByTestId("qb-filters-panel")).findByText(
        "Quantity is equal to 2 selections",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getRunQuantityFilterValues().slice(0, 3)).toEqual([
        null,
        [2],
        [2, 3],
      ]),
    );
    // the row count is hidden while the detail view is open
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("Showing 8 rows")).toBeInTheDocument();
  });

  it("shows the first record of the new results in the detail visualization after the query changes (metabase#54317)", async () => {
    // registered before `setup` does, so this route answers the runs
    fetchMock.post("path:/api/dataset", (call) =>
      getOrdersBelowIdDataset(JSON.parse(String(call.options.body))),
    );
    const card = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              filters: [
                {
                  type: "operator",
                  operator: "<",
                  args: [
                    { type: "column", name: "ID" },
                    { type: "literal", value: 15 },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    });
    await setup({
      card,
      database: AUTO_RUN_DATABASE,
      dataset: getOrdersBelowIdDataset(card.dataset_query),
    });
    await screen.findByText("Showing 14 rows");

    await userEvent.click(
      within(screen.getByTestId("view-footer")).getByText("Visualization"),
    );
    await userEvent.click(await screen.findByTestId("Detail-button"));

    const footer = await screen.findByTestId("pagination-footer");
    for (let item = 1; item < 14; item++) {
      await userEvent.click(within(footer).getByLabelText("Next page"));
    }
    expect(within(footer).getByText("Item 14 of 14")).toBeInTheDocument();
    expect(getDetailVisualizationValues().get("ID")).toBe("14");

    await userEvent.click(
      within(screen.getByTestId("qb-filters-panel")).getByText(
        "ID is less than 15",
      ),
    );
    const picker = await screen.findByTestId("number-filter-picker");
    const input = within(picker).getByLabelText("Filter value");
    await userEvent.clear(input);
    await userEvent.type(input, "10");
    await userEvent.click(
      within(picker).getByRole("button", { name: "Update filter" }),
    );

    expect(
      await within(screen.getByTestId("pagination-footer")).findByText(
        "Item 1 of 9",
      ),
    ).toBeInTheDocument();
    expect(getDetailVisualizationValues().get("ID")).toBe("1");
    expect(
      fetchMock.callHistory
        .calls("path:/api/dataset")
        .map((call) =>
          getFilterValues(JSON.parse(String(call.options.body)), ORDERS.ID, [
            "<",
          ]),
        ),
    ).toEqual([[15], [10]]);
  });

  it("keeps each value next to its label in the detail visualization when a column is removed (metabase#63745)", async () => {
    // registered before `setup` does, so this route answers the runs
    fetchMock.post("path:/api/dataset", (call) =>
      getJoinedOrdersDataset(JSON.parse(String(call.options.body))),
    );
    const card = createMockUnsavedCard({
      display: "object",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              joins: [
                {
                  source: { type: "table", id: PRODUCTS_ID },
                  strategy: "left-join",
                  alias: "Products",
                  conditions: [
                    {
                      operator: "=",
                      left: { type: "column", name: "PRODUCT_ID" },
                      right: { type: "column", name: "ID" },
                    },
                  ],
                },
                {
                  source: { type: "table", id: PEOPLE_ID },
                  strategy: "left-join",
                  alias: "People",
                  conditions: [
                    {
                      operator: "=",
                      left: { type: "column", name: "USER_ID" },
                      right: { type: "column", name: "ID" },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    });
    await setup({
      card,
      database: AUTO_RUN_DATABASE,
      dataset: getJoinedOrdersDataset(card.dataset_query),
    });

    const detail = await screen.findByTestId("object-detail");
    expect(within(detail).getByText("People → Name")).toBeInTheDocument();
    expect(within(detail).getByText("Hudson Borer")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pagination-footer")).getByText("Item 1 of 2"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("viz-settings-button"));
    await userEvent.click(
      within(screen.getByTestId("chartsettings-sidebar")).getByRole("button", {
        name: "Add or remove columns",
      }),
    );
    const values = getDetailVisualizationValues();
    expect(values.get("ID")).toBe("5");
    expect(values.get("User ID")).toBe("1");
    expect(values.get("Product ID")).toBe("14");

    await userEvent.click(
      within(screen.getByTestId("orders-table-columns")).getByLabelText("ID"),
    );

    await waitFor(() =>
      expect(getDetailVisualizationValues().has("ID")).toBe(false),
    );
    const valuesWithoutId = getDetailVisualizationValues();
    // a stale mapping shows the value of the column above each label
    expect(valuesWithoutId.get("User ID")).toBe("1");
    expect(valuesWithoutId.get("Product ID")).toBe("14");
    expect(valuesWithoutId.get("People → Name")).toBe("Hudson Borer");
    const lastRunFieldIds = getPickedFieldIds(
      JSON.parse(
        String(
          fetchMock.callHistory.lastCall("path:/api/dataset")?.options.body,
        ),
      ),
    );
    expect(lastRunFieldIds).not.toContain(ORDERS.ID);
    expect(lastRunFieldIds).toContain(ORDERS.USER_ID);
  });
});
