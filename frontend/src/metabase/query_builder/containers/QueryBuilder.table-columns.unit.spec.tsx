import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupCardsEndpoints } from "__support__/server-mocks";
import {
  act,
  createMockDOMRect,
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  DatasetQuery,
  RowValue,
  TableColumnOrderSetting,
  TemporalUnit,
  TestJoinSpec,
  TestQuerySpec,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
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

// The e2e "test question": the source of the nested and joined questions
const TEST_QUESTION_ID = 10;
const TEST_QUESTION_NAME = "test question";

const ORDERS_JOIN_PRODUCTS_SPEC: TestJoinSpec = {
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
};

const MATH_EXPRESSION_SPEC = {
  name: "Math",
  value: {
    type: "operator",
    operator: "+",
    args: [
      { type: "literal", value: 1 },
      { type: "literal", value: 1 },
    ],
  },
} as const;

const createQuery = (spec: TestQuerySpec, sourceCards: Card[] = []) =>
  Lib.toJsQuery(Lib.createTestQuery(getColumnsProvider(sourceCards), spec));

/**
 * `table.columns` saved by an older version: each entry has a legacy
 * `fieldRef`, and some have no `name`. `TableColumnOrderSetting` no longer
 * declares this shape.
 */
const getLegacyTableColumns = (
  columns: { name?: string; fieldRef: unknown[]; enabled: boolean }[],
) =>
  // the old shape is what the test is about, and the type no longer has it
  columns as unknown as TableColumnOrderSetting[];

/** Sets the fields of the first join of the first stage by column name */
function withJoinFields(datasetQuery: DatasetQuery, columnNames: string[]) {
  const query = Lib.fromJsQuery(PROVIDER_IN_FIELD_ORDER, datasetQuery);
  const [join] = Lib.joins(query, 0);
  const columns = Lib.joinableColumns(query, 0, join).filter((column) =>
    columnNames.includes(Lib.displayInfo(query, 0, column).name),
  );
  return Lib.toJsQuery(
    Lib.replaceClause(query, 0, join, Lib.withJoinFields(join, columns)),
  );
}

const ORDERS_QUERY = createQuery({
  stages: [{ source: { type: "table", id: ORDERS_ID } }],
});

const ORDERS_JOIN_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      joins: [ORDERS_JOIN_PRODUCTS_SPEC],
      limit: 5,
    },
  ],
});

const ORDERS_JOIN_CATEGORY_QUERY = withJoinFields(
  createQuery({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        joins: [ORDERS_JOIN_PRODUCTS_SPEC],
      },
    ],
  }),
  ["CATEGORY"],
);

const ORDERS_SELF_JOIN_QUERY = withJoinFields(
  createQuery({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        fields: [
          { type: "column", name: "ID" },
          { type: "column", name: "TAX" },
        ],
        joins: [
          {
            source: { type: "table", id: ORDERS_ID },
            strategy: "left-join",
            alias: "Orders",
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "USER_ID" },
                right: { type: "column", name: "ID" },
              },
            ],
          },
        ],
        limit: 5,
      },
    ],
  }),
  ["ID", "TAX"],
);

const ORDERS_EXPRESSION_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      expressions: [MATH_EXPRESSION_SPEC],
      fields: [
        { type: "column", name: "ID" },
        { type: "column", name: "Math" },
      ],
      limit: 5,
    },
  ],
});

const ORDERS_EXPRESSION_NO_LIMIT_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      expressions: [MATH_EXPRESSION_SPEC],
      fields: [
        { type: "column", name: "ID" },
        { type: "column", name: "Math" },
      ],
    },
  ],
});

const ORDERS_AGGREGATION_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [
        { type: "operator", operator: "count", args: [] },
        {
          type: "operator",
          operator: "sum",
          args: [{ type: "column", name: "QUANTITY" }],
        },
      ],
      limit: 5,
    },
  ],
});

const MULTI_STAGE_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "PRODUCT_ID" }],
    },
    {
      filters: [
        {
          type: "operator",
          operator: ">",
          args: [
            { type: "column", name: "count" },
            { type: "literal", value: 0 },
          ],
        },
      ],
      limit: 5,
    },
  ],
});

const MULTI_STAGE_EXPRESSION_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [
        { type: "column", name: "ID", sourceFieldId: ORDERS.PRODUCT_ID },
      ],
    },
    {
      expressions: [
        {
          name: "CC",
          value: {
            type: "operator",
            operator: "*",
            args: [
              { type: "literal", value: 2 },
              { type: "column", name: "count" },
            ],
          },
        },
      ],
      limit: 5,
    },
  ],
});

const getQuestionJoinSpec = (card: Card): TestJoinSpec => ({
  source: { type: "card", id: card.id },
  strategy: "left-join",
  alias: `Question ${card.id}`,
  conditions: [
    {
      operator: "=",
      left: { type: "column", name: "ID" },
      right: { type: "column", name: "ID" },
    },
  ],
});

const getNestedQuery = (card: Card) =>
  createQuery({ stages: [{ source: { type: "card", id: card.id } }] }, [card]);

const getNestedJoinProductsQuery = (card: Card) =>
  createQuery(
    {
      stages: [
        {
          source: { type: "card", id: card.id },
          joins: [ORDERS_JOIN_PRODUCTS_SPEC],
          limit: 5,
        },
      ],
    },
    [card],
  );

const getNestedSelfJoinQuery = (card: Card) =>
  createQuery(
    {
      stages: [
        {
          source: { type: "card", id: card.id },
          joins: [getQuestionJoinSpec(card)],
          limit: 5,
        },
      ],
    },
    [card],
  );

const getOrdersJoinQuestionQuery = (card: Card) =>
  createQuery(
    {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          fields: [
            { type: "column", name: "ID" },
            { type: "column", name: "TAX" },
          ],
          joins: [getQuestionJoinSpec(card)],
          limit: 5,
        },
      ],
    },
    [card],
  );

const ORDERS_COUNT_BY_MONTH_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    },
  ],
});

const ORDERS_COUNT_BY_WEEK_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "week" }],
      limit: 5,
    },
  ],
});

const ORDERS_ID_CREATED_AT_QUANTITY_QUERY = createQuery({
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      fields: [
        { type: "column", name: "ID" },
        { type: "column", name: "CREATED_AT" },
        { type: "column", name: "QUANTITY" },
      ],
    },
  ],
});

// the long display names of the query columns
const ORDERS_COLUMN_LABELS = [
  "ID",
  "User ID",
  "Product ID",
  "Subtotal",
  "Tax",
  "Total",
  "Discount",
  "Created At",
  "Quantity",
];

const PRODUCTS_JOIN_COLUMN_LABELS = [
  "Products → ID",
  "Products → Ean",
  "Products → Title",
  "Products → Category",
  "Products → Vendor",
  "Products → Price",
  "Products → Rating",
  "Products → Created At",
];

const getAdhocCard = (
  datasetQuery: DatasetQuery,
  opts?: Partial<UnsavedCard>,
) =>
  createMockUnsavedCard({
    display: "table",
    // as the e2e ad hoc question helper does for a question with a display
    displayIsLocked: true,
    dataset_query: datasetQuery,
    ...opts,
  });

const getTestQuestion = (datasetQuery: DatasetQuery, opts?: Partial<Card>) =>
  createMockCard({
    id: TEST_QUESTION_ID,
    name: TEST_QUESTION_NAME,
    display: "table",
    dataset_query: datasetQuery,
    ...opts,
  });

function getColumnsProvider(sourceCards: Card[]) {
  return sourceCards.length === 0
    ? PROVIDER_IN_FIELD_ORDER
    : createMetadataProvider({
        metadata: createMockMetadata({
          databases: [SAMPLE_DATABASE_IN_FIELD_ORDER],
          questions: sourceCards,
        }),
      });
}

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
      // let the run end, so that it cannot undo the change below
      await act(() => fetchMock.callHistory.flush(true));
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
      await act(() => fetchMock.callHistory.flush(true));
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
      await act(() => fetchMock.callHistory.flush(true));
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
  describe("show, hide, remove and add columns", () => {
    it("should be able to show and hide table fields, implicitly joinable fields, and rename columns via popover", async () => {
      await setupColumnsQuestion({ card: getAdhocCard(ORDERS_QUERY) });

      const implicitColumn = {
        column: "Category",
        columnName: "Product → Category",
        table: "product",
      };
      await assertAddingColumn(implicitColumn);
      await assertHidingColumn(implicitColumn);
      await assertShowingColumn(implicitColumn);
      await assertRemovingColumn(implicitColumn);

      const taxColumn = {
        column: "Tax",
        columnName: "Tax",
        sanityCheck: "ID",
        table: "orders",
      };
      await assertHidingColumn(taxColumn);
      await assertShowingColumn(taxColumn);
      await assertRemovingColumn(taxColumn);
      await assertAddingColumn(taxColumn);

      await openColumnSettingsFromHeader("Product ID");
      const titleInput = await screen.findByDisplayValue("Product ID");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "prod_id");
      // clicking outside of the popover to close it
      await userEvent.click(screen.getByTestId("qb-header"));
      expect(
        await within(getTableRoot()).findByRole("columnheader", {
          name: "prod_id",
        }),
      ).toBeInTheDocument();
      expect(
        within(getTableRoot()).queryByRole("columnheader", {
          name: "Product ID",
        }),
      ).not.toBeInTheDocument();
    });

    it("should be able to show and hide all and single table fields in a join", async () => {
      await setupColumnsQuestion({ card: getAdhocCard(ORDERS_JOIN_QUERY) });

      await userEvent.click(
        screen.getByRole("button", { name: "Add or remove columns" }),
      );
      const productsGroup = await screen.findByTestId("products-table-columns");
      await runAndWait(() =>
        userEvent.click(within(productsGroup).getByLabelText("Remove all")),
      );
      expect(getReturnedColumnNamesOfRun()).toEqual(ORDERS_COLUMN_LABELS);

      const productsGroupAfterRemove = screen.getByTestId(
        "products-table-columns",
      );
      for (const name of ["Title", "Category", "Price"]) {
        expect(
          within(productsGroupAfterRemove).getByLabelText(name),
        ).not.toBeChecked();
      }
      const addAll = within(productsGroupAfterRemove).getByLabelText("Add all");
      expect(addAll).not.toBeChecked();
      await runAndWait(() => userEvent.click(addAll));
      expect(getReturnedColumnNamesOfRun()).toEqual([
        ...ORDERS_COLUMN_LABELS,
        ...PRODUCTS_JOIN_COLUMN_LABELS,
      ]);

      const productsGroupAfterAdd = screen.getByTestId(
        "products-table-columns",
      );
      for (const name of ["Title", "Category", "Price"]) {
        expect(
          within(productsGroupAfterAdd).getByLabelText(name),
        ).toBeChecked();
      }
      await userEvent.click(
        screen.getByRole("button", { name: "Done picking columns" }),
      );

      const categoryColumn = {
        column: "Category",
        columnName: "Products → Category",
        sanityCheck: "Products → Ean",
        table: "products",
      };
      await assertHidingColumn(categoryColumn);
      await assertShowingColumn(categoryColumn);
      await assertRemovingColumn(categoryColumn);
      await assertAddingColumn(categoryColumn);
    });

    it("should be able to show and hide table fields with a join with fields", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_JOIN_CATEGORY_QUERY),
      });

      const categoryColumn = {
        column: "Category",
        columnName: "Products → Category",
        table: "products",
      };
      await assertHidingColumn(categoryColumn);
      await assertRemovingColumn(categoryColumn);

      await assertAddingColumn({
        column: "Ean",
        columnName: "Products → Ean",
        table: "products",
      });
    });

    it("should be able to show and hide table fields with a self join with fields", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_SELF_JOIN_QUERY),
      });

      const taxColumn = {
        column: "Tax",
        columnName: "Orders → Tax",
        // the second group of the same table
        table: "orders 2",
        sanityCheck: "Tax",
      };
      await assertHidingColumn(taxColumn);
      await assertShowingColumn(taxColumn);
      await assertRemovingColumn(taxColumn);
      await assertAddingColumn(taxColumn);
    });

    it.each([
      { name: "a table", query: ORDERS_EXPRESSION_QUERY },
      {
        name: "a table with selected fields",
        query: ORDERS_EXPRESSION_NO_LIMIT_QUERY,
      },
    ])(
      "should be able to show and hide custom expressions for $name",
      async ({ query }) => {
        await setupColumnsQuestion({ card: getAdhocCard(query) });

        const mathColumn = {
          column: "Math",
          columnName: "Math",
          table: "orders",
          sanityCheck: "ID",
        };
        await assertHidingColumn(mathColumn);
        await assertShowingColumn(mathColumn);
      },
    );

    it("should be able to show and hide columns from aggregations", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_AGGREGATION_QUERY),
      });

      const countColumn = {
        column: "Count",
        columnName: "Count",
        table: "orders",
        sanityCheck: "Sum of Quantity",
      };
      const sumColumn = {
        column: "Sum of Quantity",
        columnName: "Sum of Quantity",
        table: "orders",
        sanityCheck: "Count",
      };
      await assertHidingColumn(countColumn);
      await assertShowingColumn(countColumn);
      await assertHidingColumn(sumColumn);
      await assertShowingColumn(sumColumn);
    });
    describe("multi-stage questions", () => {
      it("should be able to show and hide table fields in a multi-stage query", async () => {
        await setupColumnsQuestion({
          card: getAdhocCard(MULTI_STAGE_QUERY),
        });

        const countColumn = {
          column: "Count",
          columnName: "Count",
          table: "summaries",
          sanityCheck: "Product ID",
        };
        const productIdColumn = {
          column: "Product ID",
          columnName: "Product ID",
          table: "summaries",
          sanityCheck: "Count",
        };
        await assertHidingColumn(countColumn);
        await assertShowingColumn(countColumn);
        await assertHidingColumn(productIdColumn);
        await assertShowingColumn(productIdColumn);
      });

      it("should be able to show and hide columns in a multi-stage query with custom columns (metabase#35067)", async () => {
        await setupColumnsQuestion({
          card: getAdhocCard(MULTI_STAGE_EXPRESSION_QUERY),
        });

        const countColumn = {
          column: "Count",
          columnName: "Count",
          table: "summaries",
          sanityCheck: "CC",
        };
        const productIdColumn = {
          column: "Product → ID",
          columnName: "Product → ID",
          table: "summaries",
          sanityCheck: "Count",
        };
        const customColumn = {
          column: "CC",
          columnName: "CC",
          table: "summaries",
          sanityCheck: "Count",
        };
        await assertHidingColumn(countColumn);
        await assertShowingColumn(countColumn);
        await assertRemovingColumn(countColumn);
        await assertAddingColumn(countColumn);
        await assertHidingColumn(productIdColumn);
        await assertShowingColumn(productIdColumn);
        await assertRemovingColumn(productIdColumn);
        await assertAddingColumn(productIdColumn);
        await assertHidingColumn(customColumn);
        await assertShowingColumn(customColumn);
      });
    });

    describe("nested structured questions", () => {
      it("should be able to show and hide fields and implicitly joinable fields from a nested query", async () => {
        const sourceCard = getTestQuestion(ORDERS_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const implicitColumn = {
          column: "Category",
          columnName: "Product → Category",
          table: "product",
        };
        await assertAddingColumn(implicitColumn);
        await assertHidingColumn(implicitColumn);
        await assertRemovingColumn(implicitColumn);

        const taxColumn = {
          column: "Tax",
          columnName: "Tax",
          table: "test question",
          sanityCheck: "ID",
        };
        await assertHidingColumn(taxColumn);
        await assertShowingColumn(taxColumn);
        await assertRemovingColumn(taxColumn);
        await assertAddingColumn(taxColumn);
      });

      it("should be able to show and hide fields from a nested query with joins (metabase#32373)", async () => {
        const sourceCard = getTestQuestion(ORDERS_JOIN_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const categoryColumn = {
          column: "Products → Category",
          columnName: "Products → Category",
          table: "test question",
          sanityCheck: "Products → Ean",
        };
        await assertHidingColumn(categoryColumn);
        await assertShowingColumn(categoryColumn);
        await assertRemovingColumn(categoryColumn);
        await assertAddingColumn(categoryColumn);
      });

      it("should be able to show and hide fields from a nested query with joins and fields (metabase#32373)", async () => {
        const sourceCard = getTestQuestion(ORDERS_JOIN_CATEGORY_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const categoryColumn = {
          column: "Products → Category",
          columnName: "Products → Category",
          table: "test question",
        };
        await assertHidingColumn(categoryColumn);
        await assertRemovingColumn(categoryColumn);

        await assertAddingColumn({
          column: "Email",
          columnName: "User → Email",
          table: "user",
        });

        await assertAddingColumn(categoryColumn);
      });

      it("should be able to show and hide implicitly joinable fields for a nested query with joins and fields", async () => {
        const sourceCard = getTestQuestion(ORDERS_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedJoinProductsQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const userIdColumn = {
          column: "ID",
          columnName: "User → ID",
          table: "user",
        };
        await assertAddingColumn(userIdColumn);
        await assertHidingColumn(userIdColumn);
        await assertRemovingColumn(userIdColumn);
      });

      it("should be able to show and hide custom expressions from a nested query", async () => {
        const sourceCard = getTestQuestion(ORDERS_EXPRESSION_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const mathColumn = {
          column: "Math",
          columnName: "Math",
          table: "test question",
          sanityCheck: "ID",
        };
        await assertHidingColumn(mathColumn);
        await assertShowingColumn(mathColumn);
        await assertRemovingColumn(mathColumn);
        await assertAddingColumn(mathColumn);
      });

      it("should be able to show and hide columns from aggregations from a nested query", async () => {
        const sourceCard = getTestQuestion(ORDERS_AGGREGATION_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const countColumn = {
          column: "Count",
          columnName: "Count",
          table: "test question",
          sanityCheck: "Sum of Quantity",
        };
        const sumColumn = {
          column: "Sum of Quantity",
          columnName: "Sum of Quantity",
          table: "test question",
          sanityCheck: "Count",
        };
        await assertHidingColumn(countColumn);
        await assertShowingColumn(countColumn);
        await assertHidingColumn(sumColumn);
        await assertShowingColumn(sumColumn);
      });

      it("should be able to show and hide columns from a nested query with a self join", async () => {
        const sourceCard = getTestQuestion(ORDERS_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getNestedSelfJoinQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const taxColumn = {
          column: `Question ${TEST_QUESTION_ID} → Tax`,
          columnName: `Question ${TEST_QUESTION_ID} → Tax`,
          // the second group of the same question
          table: "test question 2",
          sanityCheck: "Tax",
        };
        await assertHidingColumn(taxColumn);
        await assertShowingColumn(taxColumn);
        await assertRemovingColumn(taxColumn);
        await assertAddingColumn(taxColumn);
      });

      it("should be able to show and hide custom expressions from a joined question", async () => {
        const sourceCard = getTestQuestion(ORDERS_EXPRESSION_QUERY);
        await setupColumnsQuestion({
          card: getAdhocCard(getOrdersJoinQuestionQuery(sourceCard)),
          sourceCards: [sourceCard],
        });

        const mathColumn = {
          column: `Question ${TEST_QUESTION_ID} → Math`,
          columnName: `Question ${TEST_QUESTION_ID} → Math`,
          table: "test question",
          sanityCheck: "Tax",
        };
        await assertHidingColumn(mathColumn);
        await assertShowingColumn(mathColumn);
        await assertRemovingColumn(mathColumn);
        await assertAddingColumn(mathColumn);
      });
    });
  });
  describe("column settings that do not match the results", () => {
    it("should not duplicate column in settings when removing and adding it back (metabase#22206)", async () => {
      await setupColumnsQuestion({ card: getAdhocCard(ORDERS_QUERY) });
      const columnNamesOfFirstRun = getReturnedColumnNamesOfRun();

      // The duplicate shows on the second cycle
      for (let cycle = 0; cycle < 2; cycle++) {
        await userEvent.click(
          within(getVisibleColumns()).getByTestId("Subtotal-hide-button"),
        );
        await runAndWait(() =>
          userEvent.click(
            within(screen.getByTestId("qb-header")).getByRole("button", {
              name: "Refresh",
            }),
          ),
        );
        // hiding a column does not remove it from the query
        expect(getReturnedColumnNamesOfRun()).toEqual(columnNamesOfFirstRun);

        await userEvent.click(
          within(getVisibleColumns()).getByTestId("Subtotal-show-button"),
        );
        expect(
          await within(getVisibleColumns()).findByTestId(
            "Subtotal-hide-button",
          ),
        ).toBeInTheDocument();
        expect(
          within(getVisibleColumns()).getAllByTestId("draggable-item-Subtotal"),
        ).toHaveLength(1);
      }

      await runAndWait(() =>
        userEvent.click(
          within(screen.getByTestId("qb-header")).getByRole("button", {
            name: "Refresh",
          }),
        ),
      );
      expect(
        await within(getTableRoot()).findByRole("columnheader", {
          name: "Subtotal",
        }),
      ).toBeInTheDocument();
    });

    it("should not reset the column order after one of the columns is removed from data source (metabase#7884)", async () => {
      // the source question had the columns C1, C2 and C3 when the nested
      // question was saved, and then lost C2
      const sourceCard = getTestQuestion(
        Lib.toJsQuery(
          Lib.createTestNativeQuery(PROVIDER_IN_FIELD_ORDER, {
            query: "SELECT 1 AS C1, 3 AS C3",
          }),
        ),
        {
          result_metadata: ["C1", "C3"].map((name) =>
            createMockColumn({
              name,
              display_name: name,
              base_type: "type/Integer",
              effective_type: "type/Integer",
              field_ref: ["field", name, { "base-type": "type/Integer" }],
            }),
          ),
        },
      );
      await setupColumnsQuestion({
        card: getAdhocCard(getNestedQuery(sourceCard), {
          visualization_settings: {
            "table.columns": [
              { name: "C3", enabled: true },
              { name: "C1", enabled: true },
              { name: "C2", enabled: true },
            ],
          },
        }),
        sourceCards: [sourceCard],
      });

      expect(getReturnedColumnNamesOfRun()).toEqual(["C1", "C3"]);
      expect(getColumnHeaderNames()).toEqual(["C3", "C1"]);
      expect(getItemNames(screen.getByTestId("visible-columns"))).toEqual([
        "C3",
        "C1",
      ]);
    });

    it("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_COUNT_BY_MONTH_QUERY, {
          visualization_settings: {
            "table.columns": getLegacyTableColumns(
              [
                ORDERS.ID,
                ORDERS.USER_ID,
                ORDERS.PRODUCT_ID,
                ORDERS.SUBTOTAL,
                ORDERS.TAX,
                ORDERS.DISCOUNT,
              ].map((fieldId) => ({
                fieldRef: ["field", fieldId, null],
                enabled: true,
              })),
            ),
            column_settings: {
              '["name","count"]': { show_mini_bar: true },
            },
          },
        }),
      });

      expect(
        within(screen.getByTestId("qb-header")).getByText(
          "Count by Created At: Month",
        ),
      ).toBeInTheDocument();
      const sidebar = screen.getByTestId("sidebar-left");
      expect(sidebar).not.toHaveTextContent("[Unknown]");
      expect(sidebar).toHaveTextContent("Created At");
      expect(sidebar).toHaveTextContent("Count");
      expect(getItemNames(sidebar)).toEqual(["Created At: Month", "Count"]);
      expect(
        within(getTableRoot()).getAllByTestId("mini-bar-container"),
      ).toHaveLength(2);
    });

    it("should move a column to a new position on the first drag (metabase#28311)", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_QUERY, {
          visualization_settings: {
            "table.columns": getLegacyTableColumns(
              [
                { fieldId: ORDERS.ID, enabled: true },
                { fieldId: ORDERS.USER_ID, enabled: true },
                { fieldId: ORDERS.PRODUCT_ID, enabled: true },
                { fieldId: ORDERS.SUBTOTAL, enabled: false },
                { fieldId: ORDERS.TAX, enabled: false },
                { fieldId: ORDERS.DISCOUNT, enabled: false },
              ].map(({ fieldId, enabled }) => ({
                fieldRef: ["field", fieldId, null],
                enabled,
              })),
            ),
          },
        }),
      });
      expect(
        screen.getByRole("columnheader", { name: "Product ID" }),
      ).toBeInTheDocument();

      const columnList = screen.getByTestId("chart-settings-table-columns");
      mockItemRects(columnList);
      expect(getItemNames(columnList).slice(0, 3)).toEqual([
        "ID",
        "User ID",
        "Product ID",
      ]);
      await dragItem(columnList, { from: 2, to: 0 });

      await waitFor(() =>
        expect(getItemNames(columnList).slice(0, 3)).toEqual([
          "Product ID",
          "ID",
          "User ID",
        ]),
      );
      expect(getColumnHeaderNames().slice(0, 3)).toEqual([
        "Product ID",
        "ID",
        "User ID",
      ]);
    });

    it("should not mess up columns order (metabase#42049)", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_ID_CREATED_AT_QUANTITY_QUERY, {
          visualization_settings: {
            "table.columns": getLegacyTableColumns([
              {
                name: "ID",
                fieldRef: ["field", ORDERS.ID, null],
                enabled: true,
              },
              {
                name: "CREATED_AT",
                fieldRef: [
                  "field",
                  ORDERS.CREATED_AT,
                  { "temporal-unit": "default" },
                ],
                enabled: true,
              },
              {
                name: "QUANTITY",
                fieldRef: ["field", ORDERS.QUANTITY, null],
                enabled: true,
              },
            ]),
          },
        }),
        // simulate a named field ref
        transformDataset: (dataset) => {
          const [id, createdAt, ...cols] = dataset.data.cols;
          return {
            ...dataset,
            data: {
              ...dataset.data,
              cols: [
                id,
                {
                  ...createdAt,
                  field_ref: [
                    "field",
                    "created_at",
                    { "base-type": "type/DateTime" },
                  ],
                },
                ...cols,
              ],
            },
          };
        },
      });
      expect(getColumnHeaderNames()).toEqual(["ID", "Created At", "Quantity"]);

      await userEvent.click(screen.getByTestId("question-filter-header"));
      const popover = await screen.findByRole("dialog");
      await userEvent.click(within(popover).getByText("Created At"));
      await runAndWait(() =>
        userEvent.click(
          within(popover).getByRole("button", { name: "Previous month" }),
        ),
      );
      expect(getFilterNamesOfRun()).toEqual([
        "Created At is in the previous month",
      ]);
      expect(
        within(screen.getByTestId("qb-filters-panel")).getByTestId(
          "filter-pill",
        ),
      ).toHaveTextContent("Created At");

      expect(getColumnHeaderNames()).toEqual(["ID", "Created At", "Quantity"]);
    });

    it("should handle duplicated values in table.columns viz settings (metabase#62053)", async () => {
      mockGetBoundingClientRect(WIDE_RECT);
      const nativeQuery = Lib.toJsQuery(
        Lib.createTestNativeQuery(PROVIDER_IN_FIELD_ORDER, {
          query: "SELECT ID, TAX FROM ORDERS LIMIT 5",
        }),
      );
      await setup({
        card: createMockCard({
          id: 62053,
          display: "table",
          dataset_query: nativeQuery,
          visualization_settings: {
            "table.columns": [
              { name: "ID", enabled: true },
              // Duplicate ID column entry
              { name: "ID", enabled: true },
              { name: "TAX", enabled: true },
            ],
          },
        }),
        database: SAMPLE_DATABASE_IN_FIELD_ORDER,
        dataset: createMockDataset({
          database_id: SAMPLE_DB_ID,
          status: "completed",
          row_count: 2,
          json_query: nativeQuery,
          data: {
            cols: ["ID", "TAX"].map((name) =>
              createMockColumn({
                name,
                display_name: name,
                base_type: "type/Float",
                effective_type: "type/Float",
                field_ref: ["field", name, { "base-type": "type/Float" }],
              }),
            ),
            rows: [
              [1, 2.07],
              [2, 6.1],
            ],
          },
        }),
      });

      // Verify the table renders correctly despite duplicated viz settings
      const table = await screen.findByTestId("table-root");
      expect(
        await within(table).findByRole("columnheader", { name: "TAX" }),
      ).toBeInTheDocument();
      expect(within(table).getAllByText("ID")).toHaveLength(1);
      expect(getColumnHeaderNames()).toEqual(["ID", "TAX"]);
      expect(within(table).getByText("6.1")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      const visibleColumns = await screen.findByTestId("visible-columns");
      expect(within(visibleColumns).getByText("ID")).toBeInTheDocument();
      expect(
        within(visibleColumns).getByTestId("ID-hide-button"),
      ).toBeInTheDocument();
      expect(within(visibleColumns).getByText("TAX")).toBeInTheDocument();
      expect(
        within(visibleColumns).getByTestId("TAX-hide-button"),
      ).toBeInTheDocument();
    });
  });

  it("should respect date_style column setting for week temporal unit", async () => {
    await setupColumnsQuestion({
      card: getAdhocCard(ORDERS_COUNT_BY_WEEK_QUERY),
    });

    await userEvent.click(
      within(screen.getByTestId("sidebar-left")).getByTestId(
        "Created At: Week-settings-button",
      ),
    );

    const getWeekCells = () =>
      within(getTableRoot())
        .getAllByTestId("cell-data")
        .map((cell) => cell.textContent)
        .filter((text) => text?.includes("–"));

    await userEvent.click(await screen.findByText("Date style"));
    await userEvent.click(await screen.findByText(/^1\/31\/2018/));
    await waitFor(() => expect(getWeekCells()).toHaveLength(2));
    expect(getWeekCells()).toEqual([
      "1/5/2025 – 1/11/2025",
      "1/12/2025 – 1/18/2025",
    ]);
    // Format like "1/1/2025 – 1/7/2025"
    for (const text of getWeekCells()) {
      expect(text).toMatch(/^\d+\/\d+\/\d{4} – \d+\/\d+\/\d{4}$/);
    }

    await userEvent.click(screen.getByText("Date style"));
    await userEvent.click(await screen.findByText(/^2018\/1\/31/));
    // Format like "2025/1/1 – 2025/1/7"
    await waitFor(() =>
      expect(getWeekCells()).toEqual([
        "2025/1/5 – 2025/1/11",
        "2025/1/12 – 2025/1/18",
      ]),
    );

    await userEvent.click(screen.getByText("YYYY.M.D"));
    // Format like "2025.1.1 – 2025.1.7"
    await waitFor(() =>
      expect(getWeekCells()).toEqual([
        "2025.1.5 – 2025.1.11",
        "2025.1.12 – 2025.1.18",
      ]),
    );
  });
  describe("column reordering between pinned and unpinned sections", () => {
    it("should allow reordering a column from the unpinned section into the pinned section", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_QUERY, {
          visualization_settings: {
            "table.freeze_columns": true,
            "table.freeze_columns_count": 1,
          },
        }),
        openSettings: false,
      });
      expect(getPinnedHeaderNames()).toEqual(["ID"]);

      mockHeaderRects();
      await dragHeader({ from: "User ID", to: "ID" });

      await waitFor(() => expect(getPinnedHeaderNames()).toEqual(["User ID"]));
      expect(getColumnHeaderNames().slice(0, 3)).toEqual([
        "User ID",
        "ID",
        "Product ID",
      ]);
      // the new order is saved to the question
      expect(await getSavedColumnOrder(3)).toEqual([
        "User ID",
        "ID",
        "Product ID",
      ]);
    });

    it("should allow reordering a column from the pinned section into the unpinned section", async () => {
      await setupColumnsQuestion({
        card: getAdhocCard(ORDERS_QUERY, {
          visualization_settings: {
            "table.freeze_columns": true,
            "table.freeze_columns_count": 2,
          },
        }),
        openSettings: false,
      });
      expect(getPinnedHeaderNames()).toEqual(["ID", "User ID"]);

      mockHeaderRects();
      await dragHeader({ from: "ID", to: "Subtotal" });

      await waitFor(() =>
        expect(getPinnedHeaderNames()).toEqual(["User ID", "Product ID"]),
      );
      expect(getColumnHeaderNames().slice(0, 4)).toEqual([
        "User ID",
        "Product ID",
        "Subtotal",
        "ID",
      ]);
      // the new order is saved to the question
      expect(await getSavedColumnOrder(4)).toEqual([
        "User ID",
        "Product ID",
        "Subtotal",
        "ID",
      ]);
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
// wide enough for the data grid to render the columns of a join of three tables
const WIDE_RECT = { width: 8000, height: 800 };

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
function getCellValue(col: DatasetColumn, rowIndex: number): RowValue {
  const type = String(col.effective_type ?? col.base_type);
  if (type.includes("Text")) {
    return `${col.name.toLowerCase()} ${rowIndex + 1}`;
  }
  if (type.includes("Date")) {
    // Sundays a week apart: the starts of two weeks, as the backend returns
    // them for the week unit
    return new Date(Date.UTC(2025, 0, 5 + 7 * rowIndex)).toISOString();
  }
  return rowIndex + 1;
}

/**
 * Returns the columns that the query asks for, in the order of the query, with
 * the names, display names and refs that the backend gives them.
 */
function getQueryDataset(
  provider: Lib.MetadataProvider,
  datasetQuery: DatasetQuery,
) {
  const query = Lib.fromJsQuery(provider, datasetQuery);
  const stageIndex = -1;
  const cols = Lib.returnedColumns(query, stageIndex).map((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    const fieldRef = Lib.legacyRef(query, stageIndex, column);
    const fieldId =
      fieldRef[0] === "field" && typeof fieldRef[1] === "number"
        ? fieldRef[1]
        : undefined;
    const bucket = Lib.temporalBucket(column);
    return createMockColumn({
      id: fieldId,
      name: info.name,
      display_name: info.longDisplayName,
      base_type: info.effectiveType,
      effective_type: info.effectiveType,
      semantic_type: info.semanticType,
      field_ref: fieldRef,
      unit:
        bucket != null
          ? // the short name of a temporal bucket is its unit
            (Lib.displayInfo(query, stageIndex, bucket)
              .shortName as TemporalUnit)
          : undefined,
      source: info.isAggregation
        ? "aggregation"
        : info.isBreakout
          ? "breakout"
          : "fields",
    });
  });
  return createMockDataset({
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: 2,
    json_query: datasetQuery,
    data: {
      cols,
      rows: [0, 1].map((rowIndex) =>
        cols.map((col) => getCellValue(col, rowIndex)),
      ),
    },
  });
}

let columnsProvider: Lib.MetadataProvider = PROVIDER_IN_FIELD_ORDER;

async function setupColumnsQuestion({
  card,
  sourceCards = [],
  transformDataset = (dataset) => dataset,
  openSettings = true,
}: {
  card: UnsavedCard;
  sourceCards?: Card[];
  /** Changes what the backend returns */
  transformDataset?: (dataset: Dataset) => Dataset;
  /** Opens the column list in the settings sidebar */
  openSettings?: boolean;
}) {
  // the data grid measures its size once, and renders the columns that fit
  mockGetBoundingClientRect(WIDE_RECT);
  columnsProvider = getColumnsProvider(sourceCards);
  // registered before `setup` does, so this route answers the runs
  fetchMock.post("path:/api/dataset", (call) =>
    transformDataset(
      getQueryDataset(columnsProvider, JSON.parse(String(call.options.body))),
    ),
  );
  // the data source of a nested question links to its source question
  setupCardsEndpoints(sourceCards);
  await setup({
    card,
    initialRoute: `/question#${serializeCardForUrl(card, {
      includeDisplayIsLocked: true,
    })}`,
    database: SAMPLE_DATABASE_IN_FIELD_ORDER,
    metadata: createMockCardQueryMetadata({
      databases: [SAMPLE_DATABASE_IN_FIELD_ORDER],
      cards: sourceCards,
    }),
  });
  await waitFor(() => expect(getDatasetCalls()).toHaveLength(1));
  await act(() => fetchMock.callHistory.flush(true));
  const [firstColumnName] = getReturnedColumnNamesOfRun();
  await within(getTableRoot()).findByRole("columnheader", {
    name: firstColumnName,
  });
  if (openSettings) {
    await userEvent.click(screen.getByTestId("viz-settings-button"));
    await screen.findByTestId("chart-settings-table-columns");
  }
}

type TableColumnStep = {
  /** The label in the column picker */
  column: string;
  /** The name in the table and in the column list */
  columnName: string;
  /** The column picker group */
  table: string;
  /** Another column that stays enabled */
  sanityCheck?: string;
};

const getTableRoot = () => screen.getByTestId("table-root");

const getVisibleColumns = () => screen.getByTestId("visible-columns");

const getColumnItem = (name: string) =>
  within(getVisibleColumns()).getByRole("listitem", { name });

const queryColumnHeader = (name: string) =>
  within(getTableRoot()).queryByRole("columnheader", { name });

const expectColumnEnabled = (name: string, isEnabled: boolean) =>
  expect(getColumnItem(name)).toHaveAttribute(
    "data-enabled",
    String(isEnabled),
  );

async function runAndWait(action: () => Promise<void>) {
  const runCount = getDatasetCalls().length;
  await action();
  await waitFor(() => expect(getDatasetCalls()).toHaveLength(runCount + 1));
  // let the run end, so that its result is on the page
  await act(() => fetchMock.callHistory.flush(true));
}

async function assertHidingColumn({
  column,
  columnName,
  table,
  sanityCheck,
}: TableColumnStep) {
  expect(
    await within(getTableRoot()).findByRole("columnheader", {
      name: columnName,
    }),
  ).toBeInTheDocument();
  const runCount = getDatasetCalls().length;
  await userEvent.click(
    within(getVisibleColumns()).getByTestId(`${columnName}-hide-button`),
  );
  await waitFor(() => expectColumnEnabled(columnName, false));
  if (sanityCheck) {
    expectColumnEnabled(sanityCheck, true);
    expect(queryColumnHeader(sanityCheck)).toBeInTheDocument();
  }
  await waitFor(() =>
    expect(queryColumnHeader(columnName)).not.toBeInTheDocument(),
  );
  // hiding a column does not change the query
  expect(getDatasetCalls()).toHaveLength(runCount);

  await userEvent.click(
    screen.getByRole("button", { name: "Add or remove columns" }),
  );
  expect(
    within(await screen.findByTestId(`${table}-table-columns`)).getByLabelText(
      column,
    ),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole("button", { name: "Done picking columns" }),
  );
}

async function assertShowingColumn({
  columnName,
  sanityCheck,
}: TableColumnStep) {
  await userEvent.click(
    within(getVisibleColumns()).getByTestId(`${columnName}-show-button`),
  );
  await waitFor(() => expectColumnEnabled(columnName, true));
  if (sanityCheck) {
    expectColumnEnabled(sanityCheck, true);
  }
  expect(
    await within(getTableRoot()).findByRole("columnheader", {
      name: columnName,
    }),
  ).toBeInTheDocument();
}

async function assertRemovingColumn({
  column,
  columnName,
  table,
  sanityCheck,
}: TableColumnStep) {
  const columnNamesBefore = getReturnedColumnNamesOfRun();
  expect(columnNamesBefore).toContain(columnName);
  await userEvent.click(
    screen.getByRole("button", { name: "Add or remove columns" }),
  );
  const checkbox = within(
    await screen.findByTestId(`${table}-table-columns`),
  ).getByLabelText(column);
  expect(checkbox).toBeChecked();
  await runAndWait(() => userEvent.click(checkbox));
  expect(getReturnedColumnNamesOfRun()).toEqual(
    columnNamesBefore.filter((name) => name !== columnName),
  );
  await waitFor(() =>
    expect(queryColumnHeader(columnName)).not.toBeInTheDocument(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Done picking columns" }),
  );
  await waitFor(() =>
    expect(
      within(getVisibleColumns()).queryByRole("listitem", {
        name: columnName,
      }),
    ).not.toBeInTheDocument(),
  );
  if (sanityCheck) {
    expectColumnEnabled(sanityCheck, true);
  }
}

async function assertAddingColumn({
  column,
  columnName,
  table,
  sanityCheck,
}: TableColumnStep) {
  const columnNamesBefore = getReturnedColumnNamesOfRun();
  expect(columnNamesBefore).not.toContain(columnName);
  await userEvent.click(
    screen.getByRole("button", { name: "Add or remove columns" }),
  );
  const checkbox = within(
    await screen.findByTestId(`${table}-table-columns`),
  ).getByLabelText(column);
  expect(checkbox).not.toBeChecked();
  await runAndWait(() => userEvent.click(checkbox));
  const columnNamesAfter = getReturnedColumnNamesOfRun();
  expect(columnNamesAfter).toHaveLength(columnNamesBefore.length + 1);
  expect(columnNamesAfter).toEqual(
    expect.arrayContaining([...columnNamesBefore, columnName]),
  );
  expect(
    await within(getTableRoot()).findByRole("columnheader", {
      name: columnName,
    }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Done picking columns" }),
  );
  await waitFor(() => expectColumnEnabled(columnName, true));
  if (sanityCheck) {
    expectColumnEnabled(sanityCheck, true);
  }
}

/** The long display names of the columns that the last run asked for */
function getReturnedColumnNamesOfRun() {
  const call = checkNotNull(getDatasetCalls().at(-1));
  const query = Lib.fromJsQuery(
    columnsProvider,
    JSON.parse(String(call.options.body)),
  );
  return Lib.returnedColumns(query, -1).map(
    (column) => Lib.displayInfo(query, -1, column).longDisplayName,
  );
}

/** The names of the filters of the last stage of the last run */
function getFilterNamesOfRun() {
  const call = checkNotNull(getDatasetCalls().at(-1));
  const query = Lib.fromJsQuery(
    columnsProvider,
    JSON.parse(String(call.options.body)),
  );
  return Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );
}

async function openColumnSettingsFromHeader(name: string) {
  const header = screen.getByRole("columnheader", { name });
  await userEvent.click(within(header).getByText(name));
  const clickActions = await screen.findByTestId("click-actions-view");
  await userEvent.click(
    within(clickActions).getByRole("button", { name: /gear icon/i }),
  );
}

function getPinnedHeaderNames() {
  return within(screen.getByTestId("header-pinned-quadrant"))
    .getAllByTestId("header-cell")
    .map((cell) => cell.textContent);
}

const HEADER_WIDTH = 150;
const HEADER_HEIGHT = 36;

const getHeaderCells = () =>
  within(getTableRoot()).getAllByTestId("header-cell");

/**
 * jsdom has no layout. Gives every table header a rect from its position in
 * the header row: the pinned section first, then the other columns.
 */
function mockHeaderRects() {
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (!(this instanceof HTMLElement)) {
        return createMockDOMRect(WIDE_RECT);
      }
      const cells = within(this).queryAllByTestId("header-cell");
      const isCell = this.dataset.testid === "header-cell";
      // a header cell, or the sortable wrapper of a single one
      const cell = isCell ? this : cells.length === 1 ? cells[0] : null;
      if (cell == null) {
        return createMockDOMRect(WIDE_RECT);
      }
      const x = getHeaderCells().indexOf(cell) * HEADER_WIDTH;
      return createMockDOMRect({
        x,
        y: 0,
        top: 0,
        left: x,
        width: HEADER_WIDTH,
        height: HEADER_HEIGHT,
        right: x + HEADER_WIDTH,
        bottom: HEADER_HEIGHT,
      });
    });
}

/** The first columns of the column list in the settings sidebar */
async function getSavedColumnOrder(count: number) {
  await userEvent.click(screen.getByTestId("viz-settings-button"));
  const columnList = await screen.findByTestId("chart-settings-table-columns");
  return getItemNames(columnList).slice(0, count);
}

/** Drags the header of a column and drops it on the header of another */
async function dragHeader({ from, to }: { from: string; to: string }) {
  const getCenterX = (name: string) => {
    const index = getHeaderCells().findIndex(
      (cell) => cell.textContent === name,
    );
    return index * HEADER_WIDTH + HEADER_WIDTH / 2;
  };
  const header = within(getTableRoot()).getByRole("columnheader", {
    name: from,
  });
  const startX = getCenterX(from);
  const endX = getCenterX(to);
  const y = HEADER_HEIGHT / 2;
  const step = endX > startX ? 20 : -20;

  fireEvent.mouseDown(within(header).getByText(from), {
    button: 0,
    clientX: startX,
    clientY: y,
  });
  fireEvent.mouseMove(document, { clientX: startX + step, clientY: y });
  fireEvent.mouseMove(document, { clientX: endX, clientY: y });
  fireEvent.mouseUp(document, { clientX: endX, clientY: y });
  // the drop saves the new order to the question, which updates the URL
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
