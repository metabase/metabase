import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  act,
  createMockDOMRect,
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  Card,
  DatasetColumn,
  DatasetQuery,
  RowValue,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createOrdersTableDatasetColumns,
  createPeopleAddressField,
  createPeopleNameField,
  createPeopleTable,
  createProductsTable,
  createProductsTableDatasetColumns,
  createProductsTitleDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { saveQuestion, setup } from "./test-utils";

registerVisualizations();

// the picker lists the columns by position, and a changed query runs at once,
// as with the real sample database
const SAMPLE_DATABASE_IN_FIELD_ORDER = createSampleDatabase({
  auto_run_queries: true,
  tables: [createOrdersTable(), createPeopleTable(), createProductsTable()].map(
    (table) => ({
      ...table,
      fields: checkNotNull(table.fields).map((field, position) => ({
        ...field,
        position,
      })),
    }),
  ),
});

const PROVIDER_IN_FIELD_ORDER = createMetadataProvider({
  metadata: createMockMetadata({
    databases: [SAMPLE_DATABASE_IN_FIELD_ORDER],
  }),
});

const ORDERS_ADHOC_CARD = createMockUnsavedCard({
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  ),
});

describe("QueryBuilder > table columns settings", () => {
  beforeEach(() => {
    // the data grid virtualizes its columns and renders none at zero size
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("reordering with a remapped column (metabase#39795)", () => {
    // Remapping Product ID to the product title adds a `remapped_from` column
    // to the results. This is what made the column order reset.
    const getRemappedOrdersDataset = () => {
      const cols = createOrdersTableDatasetColumns().map((col) =>
        col.name === "PRODUCT_ID" ? { ...col, remapped_to: "TITLE" } : col,
      );
      const titleCol = createProductsTitleDatasetColumn({
        display_name: "Product ID",
        remapped_from: "PRODUCT_ID",
        fk_field_id: ORDERS.PRODUCT_ID,
        field_ref: [
          "field",
          PRODUCTS.TITLE,
          { "source-field": ORDERS.PRODUCT_ID },
        ],
      });
      return createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 2,
        data: {
          cols: [...cols, titleCol],
          rows: [
            [
              1,
              11,
              21,
              10,
              1,
              11,
              0,
              "2025-01-01T00:00:00Z",
              2,
              "Rustic Paper",
            ],
            [2, 12, 22, 20, 2, 22, 0, "2025-01-02T00:00:00Z", 3, "Fancy Wool"],
          ],
        },
      });
    };

    it("should allow to re-order columns when a field is remapped to a different display value", async () => {
      await setup({
        card: ORDERS_ADHOC_CARD,
        dataset: getRemappedOrdersDataset(),
      });
      await screen.findByRole("columnheader", { name: "Product ID" });

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      const columnList = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      expect(getItemNames(columnList)).toEqual([
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Total",
        "Discount ($)",
        "Created At",
        "Quantity",
      ]);

      mockItemRects(columnList);
      await dragItem(columnList, { from: 0, to: 2 });

      await waitFor(() => {
        expect(getItemNames(columnList)).toEqual([
          "User ID",
          "Product ID",
          "ID",
          "Subtotal",
          "Tax",
          "Total",
          "Discount ($)",
          "Created At",
          "Quantity",
        ]);
      });
      // the table follows the new order
      expect(getColumnHeaderNames().slice(0, 3)).toEqual([
        "User ID",
        "Product ID",
        "ID",
      ]);
    });
  });
  describe("new query columns (metabase#40435)", () => {
    const CARD_ID = 40435;
    const ORDERS_COLUMNS = createOrdersTableDatasetColumns();

    const getReturnedColumnNames = (datasetQuery: DatasetQuery) => {
      const query = Lib.fromJsQuery(SAMPLE_PROVIDER, datasetQuery);
      return Lib.returnedColumns(query, -1).map(
        (column) => Lib.displayInfo(query, -1, column).name,
      );
    };

    // Returns the columns that the query asks for, as the backend does
    const getDataset = (datasetQuery: DatasetQuery) => {
      const cols = getReturnedColumnNames(datasetQuery).map((name) =>
        checkNotNull(ORDERS_COLUMNS.find((col) => col.name === name)),
      );
      return createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 2,
        json_query: datasetQuery,
        data: {
          cols,
          rows: [cols.map((_col, index) => index + 1), cols.map(() => 7)],
        },
      });
    };

    const setupCardStore = (initialCard: Card) => {
      let storedCard = initialCard;
      fetchMock.get(`path:/api/card/${CARD_ID}`, () => storedCard);
      fetchMock.put(`path:/api/card/${CARD_ID}`, (call) => {
        storedCard = createMockCard({
          ...storedCard,
          ...JSON.parse(String(call.options.body)),
        });
        return storedCard;
      });
      fetchMock.post(`path:/api/card/${CARD_ID}/query`, () =>
        getDataset(storedCard.dataset_query),
      );
      fetchMock.post("path:/api/dataset", (call) =>
        getDataset(JSON.parse(String(call.options.body))),
      );
    };

    const getLastSavedCard = (): Card =>
      JSON.parse(
        String(
          checkNotNull(
            fetchMock.callHistory.lastCall(`path:/api/card/${CARD_ID}`, {
              method: "PUT",
            }),
          ).options.body,
        ),
      );

    const togglePickedColumns = async (columnNames: string[]) => {
      const dataStep = await screen.findByTestId("step-data-0-0");
      await userEvent.click(within(dataStep).getByLabelText("Pick columns"));
      const popover = await screen.findByRole("dialog");
      for (const columnName of columnNames) {
        await userEvent.click(within(popover).getByText(columnName));
      }
      await userEvent.click(within(dataStep).getByLabelText("Pick columns"));
    };

    const visualize = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
    };

    it("should make new query columns visible by default", async () => {
      const card = createMockCard({
        id: CARD_ID,
        name: "Orders",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [{ source: { type: "table", id: ORDERS_ID } }],
          }),
        ),
      });
      setupCardStore(card);
      await setup({ card, database: SAMPLE_DATABASE_IN_FIELD_ORDER });

      await userEvent.click(screen.getByTestId("notebook-button"));
      await togglePickedColumns(["Select all", "User ID"]);
      await visualize();
      await waitFor(() => {
        expect(getColumnHeaderNames()).toEqual(["ID", "User ID"]);
      });

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      const columnList = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      await userEvent.click(within(columnList).getByTestId("ID-hide-button"));
      await userEvent.click(within(columnList).getByTestId("ID-show-button"));
      await saveQuestion();
      expect(
        getLastSavedCard().visualization_settings["table.columns"],
      ).toEqual([
        { name: "ID", enabled: true },
        { name: "USER_ID", enabled: true },
      ]);

      await userEvent.click(screen.getByTestId("notebook-button"));
      await togglePickedColumns(["Product ID"]);
      await saveQuestion();
      const savedCard = getLastSavedCard();
      expect(getReturnedColumnNames(savedCard.dataset_query)).toEqual([
        "ID",
        "USER_ID",
        "PRODUCT_ID",
      ]);
      expect(savedCard.visualization_settings["table.columns"]).toEqual([
        { name: "ID", enabled: true },
        { name: "USER_ID", enabled: true },
        { name: "PRODUCT_ID", enabled: true },
      ]);

      await visualize();
      await waitFor(() => {
        expect(getColumnHeaderNames()).toEqual(["ID", "User ID", "Product ID"]);
      });
      // let the save and the query run end before the test does
      await act(() => fetchMock.callHistory.flush(true));
    });
  });

  describe("column order with hidden columns", () => {
    const ORDERS_JOIN_PRODUCTS_CARD = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(PROVIDER_IN_FIELD_ORDER, {
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
              ],
              limit: 5,
            },
          ],
        }),
      ),
    });

    const ORDERS_COLUMN_NAMES = [
      "ID",
      "User ID",
      "Product ID",
      "Subtotal",
      "Tax",
      "Total",
      "Discount ($)",
      "Created At",
      "Quantity",
    ];
    const PRODUCTS_COLUMN_NAMES = [
      "Products → ID",
      "Products → Ean",
      "Products → Title",
      "Products → Category",
      "Products → Vendor",
      "Products → Price",
      "Products → Rating",
      "Products → Created At",
    ];

    it("should re-order a column when other columns are hidden (metabase#14238)", async () => {
      const columnList = await setupQuestion(ORDERS_JOIN_PRODUCTS_CARD);
      expect(getItemNames(columnList)).toEqual([
        ...ORDERS_COLUMN_NAMES,
        ...PRODUCTS_COLUMN_NAMES,
      ]);

      await hideColumn(columnList, "Subtotal");
      await hideColumn(columnList, "Tax");
      await dragItem(columnList, { from: 5, to: 3 });

      await waitFor(() =>
        expect(getItemNames(columnList)).toEqual([
          "ID",
          "User ID",
          "Product ID",
          "Total",
          "Subtotal",
          "Tax",
          "Discount ($)",
          "Created At",
          "Quantity",
          ...PRODUCTS_COLUMN_NAMES,
        ]),
      );
      // the hidden columns stay hidden after the move
      for (const name of ["Subtotal", "Tax"]) {
        expect(
          within(columnList).getByRole("listitem", { name }),
        ).toHaveAttribute("data-enabled", "false");
      }
      expect(
        within(columnList).getByRole("listitem", { name: "Total" }),
      ).toHaveAttribute("data-enabled", "true");
    });

    it("should keep the order of columns after a column is removed or added (metabase#13455)", async () => {
      const columnList = await setupQuestion(ORDERS_JOIN_PRODUCTS_CARD);

      // between Tax and Total
      await dragItem(columnList, { from: 12, to: 5 });
      const reorderedNames = [
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Products → Category",
        "Total",
        "Discount ($)",
        "Created At",
        "Quantity",
        "Products → ID",
        "Products → Ean",
        "Products → Title",
        "Products → Vendor",
        "Products → Price",
        "Products → Rating",
        "Products → Created At",
      ];
      await waitFor(() =>
        expect(getItemNames(columnList)).toEqual(reorderedNames),
      );

      const runCount = getDatasetCalls().length;
      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: "Refresh",
        }),
      );
      await waitFor(() => expect(getDatasetCalls()).toHaveLength(runCount + 1));
      expect(
        await within(screen.getByTestId("table-root")).findByText("117.03"),
      ).toBeInTheDocument();
      expect(getItemNames(columnList)).toEqual(reorderedNames);

      await hideColumn(columnList, "Total");
      await waitFor(() =>
        expect(
          within(screen.getByTestId("table-root")).queryByText("117.03"),
        ).not.toBeInTheDocument(),
      );
      expect(getItemNames(columnList)).toEqual(reorderedNames);

      await userEvent.click(
        screen.getByRole("button", { name: "Add or remove columns" }),
      );
      const address = await screen.findByLabelText("Address");
      expect(address).not.toBeChecked();
      await userEvent.click(address);
      await waitFor(() =>
        expect(getReturnedColumnNamesOfLastRun()).toContain("User → Address"),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Done picking columns" }),
      );

      const columnListWithAddress = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      await waitFor(() =>
        expect(getItemNames(columnListWithAddress)).toEqual([
          ...reorderedNames,
          "User → Address",
        ]),
      );

      mockItemRects(columnListWithAddress);
      await dragItem(columnListWithAddress, { from: 17, to: 15 });
      await waitFor(() =>
        expect(getItemNames(columnListWithAddress)).toEqual([
          ...reorderedNames.slice(0, 15),
          "User → Address",
          ...reorderedNames.slice(15),
        ]),
      );
      expect(
        within(columnListWithAddress).getByRole("listitem", { name: "Total" }),
      ).toHaveAttribute("data-enabled", "false");
    });

    it("should show a message when every column is hidden, also a column of an implicit join (metabase#29140)", async () => {
      const card = createMockUnsavedCard({
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(PROVIDER_IN_FIELD_ORDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                fields: [
                  { type: "column", name: "PRODUCT_ID" },
                  { type: "column", name: "SUBTOTAL" },
                ],
                limit: 5,
              },
            ],
          }),
        ),
      });
      const columnList = await setupQuestion(card);
      expect(getItemNames(columnList)).toEqual(["Product ID", "Subtotal"]);

      await userEvent.click(
        screen.getByRole("button", { name: "Add or remove columns" }),
      );
      const name = await within(
        screen.getByTestId("user-table-columns"),
      ).findByLabelText("Name");
      expect(name).not.toBeChecked();
      await userEvent.click(name);
      await waitFor(() =>
        expect(getReturnedColumnNamesOfLastRun()).toEqual([
          "Product ID",
          "Subtotal",
          "User → Name",
        ]),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Done picking columns" }),
      );
      const columnListWithName = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      await waitFor(() =>
        expect(getItemNames(columnListWithName)).toEqual([
          "Product ID",
          "Subtotal",
          "User → Name",
        ]),
      );

      await hideColumn(columnListWithName, "Product ID");
      await hideColumn(columnListWithName, "Subtotal");
      const main = screen.getByTestId("query-builder-main");
      expect(
        await within(main).findByRole("columnheader", { name: "User → Name" }),
      ).toBeInTheDocument();
      expect(
        within(main).queryByText("Every field is hidden right now"),
      ).not.toBeInTheDocument();

      await hideColumn(columnListWithName, "User → Name");
      expect(
        await within(main).findByText("Every field is hidden right now"),
      ).toBeInTheDocument();
    });
  });

  describe("column formatting", () => {
    const getOrdersCard = (opts?: Partial<UnsavedCard>) =>
      createMockUnsavedCard({
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(PROVIDER_IN_FIELD_ORDER, {
            stages: [{ source: { type: "table", id: ORDERS_ID } }],
          }),
        ),
        ...opts,
      });

    const openColumnSettingsFromHeader = async (name: string) => {
      const header = screen.getByRole("columnheader", { name });
      await userEvent.click(within(header).getByText(name));
      const clickActions = await screen.findByTestId("click-actions-view");
      await userEvent.click(
        within(clickActions).getByRole("button", { name: /gear icon/i }),
      );
    };

    it("should switch to the settings of another column when the sidebar is open (metabase#16043)", async () => {
      await setupQuestion(getOrdersCard());
      const sidebar = screen.getByTestId("sidebar-left");
      expect(
        within(sidebar).getByRole("tab", { name: "Conditional Formatting" }),
      ).toBeInTheDocument();

      await openColumnSettingsFromHeader("Subtotal");
      expect(await screen.findByText("Separator style")).toBeInTheDocument();
      expect(screen.queryByText("Date style")).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("head-crumbs-container"));
      await waitFor(() =>
        expect(screen.queryByText("Separator style")).not.toBeInTheDocument(),
      );

      await openColumnSettingsFromHeader("Created At");
      expect(await screen.findByText("Date style")).toBeInTheDocument();
      expect(screen.queryByText("Separator style")).not.toBeInTheDocument();
    });

    it("should show a renamed column with its new name in the sidebar (metabase#18476)", async () => {
      const columnList = await setupQuestion(
        getOrdersCard({
          visualization_settings: {
            column_settings: {
              [JSON.stringify(["ref", ["field", ORDERS.SUBTOTAL, null]])]: {
                column_title: "Pre-tax",
              },
            },
          },
        }),
      );

      expect(
        screen.getByRole("columnheader", { name: "Pre-tax" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "Subtotal" }),
      ).not.toBeInTheDocument();
      expect(getItemNames(columnList)).toEqual([
        "ID",
        "User ID",
        "Product ID",
        "Pre-tax",
        "Tax",
        "Total",
        "Discount ($)",
        "Created At",
        "Quantity",
      ]);
    });

    it("should show the symbol of any currency in every table cell when chosen", async () => {
      const columnList = await setupQuestion(getOrdersCard());
      const table = screen.getByTestId("table-root");
      expect(within(table).getByText("2.07")).toBeInTheDocument();

      await userEvent.click(
        within(columnList).getByTestId("Tax-settings-button"),
      );
      await userEvent.click(
        within(
          await screen.findByTestId("chart-settings-widget-number_style"),
        ).getByText("$1.23"),
      );
      await userEvent.click(await screen.findByDisplayValue("US Dollar"));
      await userEvent.click(await screen.findByText("Bitcoin"));
      await userEvent.click(
        await screen.findByRole("radio", { name: "In every table cell" }),
      );

      expect(await within(table).findByText("₿ 2.07")).toBeInTheDocument();
      expect(within(table).getByText("₿ 6.10")).toBeInTheDocument();
      // the other columns keep their format
      expect(within(table).getByText("117.03")).toBeInTheDocument();
    });
  });
});

const setupQuestion = async (card: UnsavedCard) => {
  // the data grid measures its size once, and renders the columns that fit
  mockGetBoundingClientRect(DEFAULT_RECT);
  setupDatasetEndpoint();
  await setup({
    card,
    database: SAMPLE_DATABASE_IN_FIELD_ORDER,
    dataset: getJoinDataset(card.dataset_query),
  });
  await screen.findByRole("columnheader", { name: /Subtotal|Pre-tax/ });
  await userEvent.click(screen.getByTestId("viz-settings-button"));
  const columnList = await screen.findByTestId("chart-settings-table-columns");
  mockItemRects(columnList);
  return columnList;
};

const hideColumn = async (columnList: HTMLElement, name: string) => {
  await userEvent.click(within(columnList).getByTestId(`${name}-hide-button`));
  await waitFor(() =>
    expect(within(columnList).getByRole("listitem", { name })).toHaveAttribute(
      "data-enabled",
      "false",
    ),
  );
};

function getItemNames(columnList: HTMLElement) {
  return within(columnList)
    .getAllByTestId(/^draggable-item-/)
    .map((item) => item.dataset.testid?.replace("draggable-item-", ""));
}

function getColumnHeaderNames() {
  return (
    within(screen.getByTestId("table-root"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
      // the row index column has no name
      .filter((name) => name !== "")
  );
}

const ITEM_HEIGHT = 40;
// wide enough for the data grid to render all its columns
const DEFAULT_RECT = { width: 4000, height: 800 };

/**
 * jsdom has no layout. Gives every sortable item a rect from its position in
 * the list, so dnd-kit can find the item a dragged one crosses. The drag
 * overlay's copy of an item starts where that item is.
 */
function mockItemRects(columnList: HTMLElement) {
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (!(this instanceof HTMLElement)) {
        return createMockDOMRect(DEFAULT_RECT);
      }
      const isItem = this.dataset.testid?.startsWith("draggable-item-");
      const items = within(this).queryAllByTestId(/^draggable-item-/);
      // an item, or the sortable wrapper of a single item
      const item = isItem ? this : items.length === 1 ? items[0] : null;
      if (item == null) {
        return createMockDOMRect(DEFAULT_RECT);
      }
      const testIds = within(columnList)
        .getAllByTestId(/^draggable-item-/)
        .map((item) => item.dataset.testid);
      const y = testIds.indexOf(item.dataset.testid) * ITEM_HEIGHT;
      return createMockDOMRect({
        x: 0,
        y,
        top: y,
        left: 0,
        width: 300,
        height: ITEM_HEIGHT,
        right: 300,
        bottom: y + ITEM_HEIGHT,
      });
    });
}

async function dragItem(
  columnList: HTMLElement,
  { from, to }: { from: number; to: number },
) {
  const items = within(columnList).getAllByTestId(/^draggable-item-/);
  const testId = items[from].dataset.testid ?? "";
  const startY = from * ITEM_HEIGHT + ITEM_HEIGHT / 2;
  // dnd-kit picks the item the dragged one overlaps most
  const endY = to * ITEM_HEIGHT + (ITEM_HEIGHT * 3) / 4;

  fireEvent.mouseDown(items[from], { button: 0, clientX: 10, clientY: startY });
  fireEvent.mouseMove(document, { clientX: 10, clientY: startY + 20 });
  fireEvent.mouseMove(document, { clientX: 10, clientY: endY });
  fireEvent.mouseUp(document, { clientX: 10, clientY: endY });
  // The drag overlay renders a copy of the item until its drop animation ends
  await waitFor(() => {
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });
}

const JOINED_PRODUCTS_COLUMNS = createProductsTableDatasetColumns().map(
  (col): DatasetColumn => ({
    ...col,
    // the backend gives a joined column a unique name
    name:
      col.name === "ID" || col.name === "CREATED_AT"
        ? `${col.name}_2`
        : col.name,
    display_name: `Products → ${col.display_name}`,
    field_ref: [
      "field",
      Number(col.id),
      { "base-type": col.base_type, "join-alias": "Products" },
    ],
  }),
);

const IMPLICIT_PEOPLE_COLUMNS = [
  createPeopleAddressField(),
  createPeopleNameField(),
].map((field) =>
  createMockColumn({
    ...field,
    id: Number(field.id),
    source: "fields",
    display_name: `User → ${field.display_name}`,
    fk_field_id: ORDERS.USER_ID,
    field_ref: [
      "field",
      Number(field.id),
      { "base-type": field.base_type, "source-field": ORDERS.USER_ID },
    ],
  }),
);

const ALL_COLUMNS = [
  ...createOrdersTableDatasetColumns(),
  ...JOINED_PRODUCTS_COLUMNS,
  ...IMPLICIT_PEOPLE_COLUMNS,
];

// values by column display name, one object for each row
const ROWS: Record<string, RowValue>[] = [
  { ID: 1, Subtotal: 37.65, Tax: 2.07, Total: 39.72 },
  { ID: 2, Subtotal: 110.93, Tax: 6.1, Total: 117.03 },
  { ID: 3, Subtotal: 52.72, Tax: 2.9, Total: 49.21 },
];

/**
 * Returns the columns that the query asks for, in the order of the query, as
 * the backend does.
 */
function getJoinDataset(datasetQuery: DatasetQuery) {
  const query = Lib.fromJsQuery(PROVIDER_IN_FIELD_ORDER, datasetQuery);
  const cols = Lib.returnedColumns(query, -1).map((column) => {
    const name = Lib.displayInfo(query, -1, column).longDisplayName;
    return checkNotNull(ALL_COLUMNS.find((col) => col.display_name === name));
  });
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: ROWS.length,
    json_query: datasetQuery,
    data: {
      cols,
      rows: ROWS.map((row) => cols.map((col) => row[col.display_name] ?? null)),
    },
  });
}

function getDatasetCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" });
}

function getReturnedColumnNamesOfLastRun() {
  const call = checkNotNull(getDatasetCalls().at(-1));
  const query = Lib.fromJsQuery(
    PROVIDER_IN_FIELD_ORDER,
    JSON.parse(String(call.options.body)),
  );
  return Lib.returnedColumns(query, -1).map(
    (column) => Lib.displayInfo(query, -1, column).longDisplayName,
  );
}

function setupDatasetEndpoint() {
  // registered before `setup` does, so this route answers the runs
  fetchMock.post("path:/api/dataset", (call) =>
    getJoinDataset(JSON.parse(String(call.options.body))),
  );
}
