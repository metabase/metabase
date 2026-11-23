import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDashboardEndpoints,
  setupDatabaseIdFieldsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  act,
  mockGetBoundingClientRect,
  mockOffsetHeightAndWidth,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { mockGetBoundingClientRect as mockGetBoundingClientRectInEachTest } from "__support__/utils";
import { serializeCardForUrl } from "metabase/common/utils/card";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type {
  Card,
  CardType,
  Dataset,
  DatasetColumn,
  Field,
  TableId,
  TemplateTag,
  TestJoinSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDashboard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockRecentCollectionItem,
  createMockTemplateTag,
  createMockUnsavedCard,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersTableDatasetColumns,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getIsRunning } from "../store/selectors";

import { TEST_COLLECTION, TEST_DB, setup } from "./test-utils";

registerVisualizations();

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

const ORDERS_TOTAL_DATASET = createMockDataset({
  data: {
    rows: [[39.72], [117.03]],
    cols: [
      createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        source: "fields",
        field_ref: ["field", ORDERS.TOTAL, null],
      }),
    ],
  },
  database_id: SAMPLE_DB_ID,
  row_count: 2,
});

const ORDERS_COLUMNS = [
  createMockColumn({
    id: ORDERS.ID,
    name: "ID",
    display_name: "ID",
    source: "fields",
    field_ref: ["field", ORDERS.ID, null],
  }),
  createMockColumn({
    id: ORDERS.USER_ID,
    name: "USER_ID",
    display_name: "User ID",
    source: "fields",
    field_ref: ["field", ORDERS.USER_ID, null],
  }),
  createMockColumn({
    id: ORDERS.PRODUCT_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    source: "fields",
    field_ref: ["field", ORDERS.PRODUCT_ID, null],
  }),
];

const PRODUCTS_COLUMNS = [
  createMockColumn({
    id: PRODUCTS.ID,
    name: "ID",
    display_name: "ID",
    source: "fields",
    field_ref: ["field", PRODUCTS.ID, null],
  }),
  createMockColumn({
    id: PRODUCTS.EAN,
    name: "EAN",
    display_name: "Ean",
    source: "fields",
    field_ref: ["field", PRODUCTS.EAN, null],
  }),
];

describe("QueryBuilder - models", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;

  mockGetBoundingClientRectInEachTest();

  beforeEach(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    window.history.replaceState(null, "", "/");
  });

  it("keeps the model's collection in the header of an ad-hoc question based on the model (metabase#46221)", async () => {
    const collection = createMockCollection({
      id: 2,
      name: "First collection",
    });
    const model = createMockCard({
      id: 1,
      name: "46221",
      type: "model",
      display: "scalar",
      collection_id: collection.id,
      collection,
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select 42",
      }),
    });
    const { router } = await setup({
      card: model,
      collections: [TEST_COLLECTION, collection],
      dataset: createMockDataset({
        data: {
          rows: [[42]],
          cols: [createMockColumn({ name: "42", display_name: "42" })],
        },
        database_id: SAMPLE_DB_ID,
        row_count: 1,
      }),
      initialRoute: `/model/${model.id}`,
    });

    expect(router.location.pathname).toMatch(/^\/model\/\d+/);
    const modelCrumbs = await screen.findByTestId("head-crumbs-container");
    await waitFor(() =>
      expect(modelCrumbs).toHaveTextContent("First collection"),
    );
    expect(modelCrumbs).toHaveTextContent(model.name);

    await userEvent.click(screen.getByTestId("viz-type-button"));
    const sidebar = await screen.findByTestId("sidebar-left");
    await userEvent.click(within(sidebar).getByTestId("more-charts-toggle"));
    await userEvent.click(within(sidebar).getByTestId("Table-button"));

    await waitFor(() => expect(router.location.pathname).toBe("/question"));
    const questionCrumbs = await screen.findByTestId("head-crumbs-container");
    await waitFor(() =>
      expect(questionCrumbs).toHaveTextContent("First collection"),
    );
    expect(questionCrumbs).toHaveTextContent(model.name);
  });

  it("shows the table headers in the metadata editor when there are no results (metabase#37300)", async () => {
    const model = createMockCard({
      id: 1,
      name: "Empty model",
      type: "model",
      display: "table",
      result_metadata: toResultMetadata(PRODUCTS_COLUMNS),
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            filters: [
              {
                type: "operator",
                operator: "=",
                args: [
                  { type: "column", name: "ID" },
                  { type: "literal", value: 999991 },
                ],
              },
            ],
          },
        ],
      }),
    });
    await setup({
      card: model,
      dataset: createMockDataset({
        data: { rows: [], cols: PRODUCTS_COLUMNS },
        database_id: SAMPLE_DB_ID,
        row_count: 0,
      }),
      initialRoute: `/model/${model.id}`,
    });

    await openQuestionActionsItem("Edit metadata");

    const main = await screen.findByTestId("visualization-root");
    expect(await within(main).findByText("ID")).toBeInTheDocument();
    expect(within(main).getByText("Ean")).toBeInTheDocument();
    expect(within(main).getByText("No results")).toBeInTheDocument();
  });

  it('sets "Display as Link" options independently for each column (metabase#51925)', async () => {
    const model = createMockCard({
      id: 1,
      name: "Orders model",
      type: "model",
      display: "table",
      result_metadata: toResultMetadata(ORDERS_COLUMNS),
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    });
    const { store } = await setup({
      card: model,
      dataset: createMockDataset({
        data: {
          rows: [
            [1, 1, 14],
            [2, 3, 6],
          ],
          cols: ORDERS_COLUMNS,
        },
        database_id: SAMPLE_DB_ID,
        row_count: 2,
      }),
      initialRoute: `/model/${model.id}`,
    });

    await openQuestionActionsItem("Edit metadata");
    const table = await screen.findByTestId("table-root");

    await userEvent.click(within(table).getByText("User ID"));
    await setLinkDisplayType();
    await userEvent.type(getLinkTextInput(), "User {{{{USER_ID}}");
    await userEvent.type(
      getLinkUrlInput(),
      "https://example.com/{{{{USER_ID}}",
    );

    await userEvent.click(within(table).getByText("Product ID"));
    await setLinkDisplayType();
    await userEvent.type(getLinkTextInput(), "Product {{{{PRODUCT_ID}}");
    await userEvent.type(
      getLinkUrlInput(),
      "https://example.com/{{{{PRODUCT_ID}}",
    );

    await userEvent.click(within(table).getByText("User ID"));
    expect(getLinkTextInput()).toHaveValue("User {{USER_ID}}");
    expect(getLinkUrlInput()).toHaveValue("https://example.com/{{USER_ID}}");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const saveCall = await waitFor(() =>
      checkNotNull(
        fetchMock.callHistory.lastCall(`path:/api/card/${model.id}`, {
          method: "PUT",
        }),
      ),
    );
    const saveBody: unknown = JSON.parse(String(saveCall.options.body));
    expect(saveBody).toMatchObject({
      result_metadata: [
        expect.not.objectContaining({ settings: expect.anything() }),
        {
          name: "USER_ID",
          settings: {
            view_as: "link",
            link_text: "User {{USER_ID}}",
            link_url: "https://example.com/{{USER_ID}}",
          },
        },
        {
          name: "PRODUCT_ID",
          settings: {
            view_as: "link",
            link_text: "Product {{PRODUCT_ID}}",
            link_url: "https://example.com/{{PRODUCT_ID}}",
          },
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByTestId("dataset-edit-bar")).not.toBeInTheDocument(),
    );
    await act(() => fetchMock.callHistory.flush(true));
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
  });

  it("renders the correct query and editor tabs after using the back and forward buttons in a model (metabase#56775, metabase#55486)", async () => {
    const model = createMockCard({
      id: 1,
      name: "Model 56775",
      type: "model",
      display: "table",
      result_metadata: toResultMetadata(PRODUCTS_COLUMNS),
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    });
    const { router } = await setup({
      card: model,
      dataset: createMockDataset({
        data: {
          rows: [
            [1, "1018947080336"],
            [2, "7663515285824"],
          ],
          cols: PRODUCTS_COLUMNS,
        },
        database_id: SAMPLE_DB_ID,
        row_count: 2,
      }),
      initialRoute: `/model/${model.id}`,
      syncWindowLocation: true,
    });

    await userEvent.click(screen.getByTestId("notebook-button"));
    await waitFor(() =>
      expect(router.location.pathname).toMatch(/\/notebook$/),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Visualize" }),
    );
    await waitFor(() =>
      expect(router.location.pathname).not.toMatch(/\/notebook$/),
    );

    act(() => router.back());
    await openQuestionActionsItem("Edit query definition");

    const dataStep = await screen.findByTestId("step-data-0-0");
    expect(await within(dataStep).findByText("Products")).toBeInTheDocument();
    expect(within(dataStep).queryByText(model.name)).not.toBeInTheDocument();

    const editBar = screen.getByTestId("dataset-edit-bar");
    await userEvent.click(within(editBar).getByText("Columns"));
    await assertIsShowingMetadataEditorTab();

    await userEvent.click(within(editBar).getByText("Query"));
    await assertIsShowingQueryEditorTab();

    act(() => router.back());
    await assertIsShowingMetadataEditorTab();

    act(() => router.back());
    await assertIsShowingQueryEditorTab();

    act(() => router.forward());
    await assertIsShowingMetadataEditorTab();

    act(() => router.forward());
    await assertIsShowingQueryEditorTab();
  });

  it("does not crash the editor when ordering a new model by a column of a table with joins (metabase#30712)", async () => {
    const newModelUrl = Urls.newQuestion({
      mode: "query",
      creationType: "custom_question",
      metadata: createMockMetadata({ databases: [TEST_DB] }),
      cardType: "model",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            joins: [
              createTestJoin({
                tableId: PRODUCTS_ID,
                alias: "Products",
                leftColumn: "PRODUCT_ID",
              }),
              createTestJoin({
                tableId: PEOPLE_ID,
                alias: "People",
                leftColumn: "USER_ID",
              }),
            ],
          },
        ],
      }),
    });
    const { store } = await setup({
      card: null,
      initialRoute: newModelUrl,
    });
    const sortedByOrdersTotal = expect.objectContaining({
      database: SAMPLE_DB_ID,
      stages: [
        expect.objectContaining({
          "source-table": ORDERS_ID,
          joins: [
            expect.objectContaining({
              alias: "Products",
              stages: [
                expect.objectContaining({ "source-table": PRODUCTS_ID }),
              ],
            }),
            expect.objectContaining({
              alias: "People",
              stages: [expect.objectContaining({ "source-table": PEOPLE_ID })],
            }),
          ],
          "order-by": [
            [
              "asc",
              expect.anything(),
              [
                "field",
                expect.not.objectContaining({
                  "join-alias": expect.anything(),
                }),
                ORDERS.TOTAL,
              ],
            ],
          ],
        }),
      ],
    });
    fetchMock.removeRoute("dataset-post");
    fetchMock.post("path:/api/dataset", (call) => {
      const query: unknown = JSON.parse(String(call.options.body));
      return sortedByOrdersTotal.asymmetricMatch(query)
        ? ORDERS_TOTAL_DATASET
        : createMockDataset({ data: { rows: [], cols: [] } });
    });
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));

    await userEvent.click(
      within(await screen.findByTestId("action-buttons")).getByText("Sort"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByText("Total"),
    );
    const sortStep = await screen.findByTestId("step-sort-0-0");
    expect(within(sortStep).getByText("Total")).toBeInTheDocument();

    const getRunCalls = () =>
      fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" });
    const runCallCountBeforeClick = getRunCalls().length;
    await userEvent.click(screen.getByTestId("run-button"));

    const runCall = await waitFor(() =>
      checkNotNull(getRunCalls()[runCallCountBeforeClick]),
    );
    const runBody: unknown = JSON.parse(String(runCall.options.body));
    expect(runBody).toEqual(sortedByOrdersTotal);
    const result = await screen.findByTestId("query-visualization-root");
    expect(await within(result).findByText("Total")).toBeInTheDocument();
  });

  it("shows the error modal when turning a native question with variables into a model, even when the model modal was acknowledged (metabase#56913)", async () => {
    const question = createMockCard({
      id: 1,
      name: "Native question",
      type: "question",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select {{ x }}",
        templateTags: { x: { "display-name": "X", type: "text" } },
      }),
    });
    setupListNotificationEndpoints({ card_id: question.id }, []);
    await setup({
      card: question,
      hasAcknowledgedModelModal: true,
    });

    await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
    await waitFor(() =>
      expect(fetchMock.callHistory.done("get-key-value")).toBe(true),
    );
    await act(() => fetchMock.callHistory.flush(true));
    await userEvent.click(await screen.findByText("Turn into a model"));

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Variables in models aren't supported yet"),
    ).toBeInTheDocument();
  });
});

async function setLinkDisplayType() {
  await userEvent.click(
    within(
      await screen.findByTestId("chart-settings-widget-view_as"),
    ).getByText("Link"),
  );
}

function getLinkTextInput() {
  return within(
    screen.getByTestId("chart-settings-widget-link_text"),
  ).getByRole("combobox");
}

function getLinkUrlInput() {
  return within(screen.getByTestId("chart-settings-widget-link_url")).getByRole(
    "combobox",
  );
}

interface CreateTestJoinOpts {
  tableId: TableId;
  alias: string;
  leftColumn: string;
}

function createTestJoin({
  tableId,
  alias,
  leftColumn,
}: CreateTestJoinOpts): TestJoinSpec {
  return {
    source: { type: "table", id: tableId },
    strategy: "left-join",
    alias,
    conditions: [
      {
        operator: "=",
        left: { type: "column", name: leftColumn },
        right: { type: "column", name: "ID" },
      },
    ],
  };
}

async function assertIsShowingMetadataEditorTab() {
  await waitFor(() =>
    expect(screen.getByTestId("editor-tabs-columns")).toBeChecked(),
  );
  expect(screen.getByTestId("editor-tabs-query")).not.toBeChecked();
  expect(screen.getByTestId("visualization-root")).toBeInTheDocument();
  expect(screen.queryByTestId("step-data-0-0")).not.toBeInTheDocument();
}

async function assertIsShowingQueryEditorTab() {
  await waitFor(() =>
    expect(screen.getByTestId("editor-tabs-query")).toBeChecked(),
  );
  expect(screen.getByTestId("editor-tabs-columns")).not.toBeChecked();
  expect(await screen.findByTestId("step-data-0-0")).toBeInTheDocument();
}

async function openQuestionActionsItem(itemName: string) {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  await userEvent.click(await screen.findByText(itemName));
}

const BREAKOUT_DATASET = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At: Month",
        source: "breakout",
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        unit: "month",
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
        base_type: "type/Integer",
      }),
    ],
    rows: [
      ["2025-01-01T00:00:00Z", 10],
      ["2025-02-01T00:00:00Z", 20],
    ],
  },
  database_id: SAMPLE_DB_ID,
  status: "completed",
  row_count: 2,
});

/**
 * Ad-hoc runs on top of the model: a query with a breakout returns grouped
 * rows, the model itself returns its own rows.
 */
const setupStructuredRuns = ({
  model,
  modelDataset,
}: {
  model: Card;
  modelDataset: Dataset;
}) => {
  fetchMock.post("path:/api/dataset", (call) => {
    const body = String(call.options.body);
    if (!body.includes(`"source-card":${model.id}`)) {
      return { status: 400 };
    }
    return body.includes('"breakout"') ? BREAKOUT_DATASET : modelDataset;
  });
};

const getBreakoutRunCount = () =>
  fetchMock.callHistory
    .calls("path:/api/dataset", { method: "POST" })
    .filter((call) => String(call.options.body).includes('"breakout"')).length;

const waitForBreakoutRunAfter = (previousCount: number) =>
  waitFor(() => expect(getBreakoutRunCount()).toBeGreaterThan(previousCount));

const expectSelectedDisplay = async ({
  selected,
  other,
}: {
  selected: string;
  other?: string;
}) => {
  await userEvent.click(await screen.findByTestId("viz-type-button"));
  const selectedOption = await screen.findByTestId(`${selected}-container`);
  expect(selectedOption).toHaveAttribute("aria-selected", "true");
  if (other) {
    expect(screen.getByTestId(`${other}-container`)).toHaveAttribute(
      "aria-selected",
      "false",
    );
  }
  await userEvent.click(screen.getByTestId("viz-type-button"));
};

describe("QueryBuilder > structured models", () => {
  describe("structured model", () => {
    const ORDERS_COLS = [
      createMockColumn({
        id: ORDERS.ID,
        name: "ID",
        display_name: "ID",
        source: "fields",
        table_id: ORDERS_ID,
        field_ref: ["field", ORDERS.ID, null],
        base_type: "type/BigInteger",
        semantic_type: "type/PK",
      }),
      createMockColumn({
        id: ORDERS.PRODUCT_ID,
        name: "PRODUCT_ID",
        display_name: "Product ID",
        source: "fields",
        table_id: ORDERS_ID,
        field_ref: ["field", ORDERS.PRODUCT_ID, null],
        base_type: "type/Integer",
        semantic_type: "type/FK",
        fk_target_field_id: PRODUCTS.ID,
      }),
      createMockColumn({
        id: ORDERS.CREATED_AT,
        name: "CREATED_AT",
        display_name: "Created At",
        source: "fields",
        table_id: ORDERS_ID,
        field_ref: ["field", ORDERS.CREATED_AT, null],
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
      }),
    ];
    // The Sample Database runs queries as they change, so do the questions here
    const SAMPLE_DB = createSampleDatabase({ auto_run_queries: true });
    const MODEL = createMockCard({
      id: 1,
      name: "Orders Model",
      type: "model",
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
      result_metadata: toResultMetadata(ORDERS_COLS),
    });
    const DATASET = createMockDataset({
      data: {
        cols: ORDERS_COLS,
        rows: [[1, 14, "2025-01-01T00:00:00Z"]],
      },
      database_id: SAMPLE_DB_ID,
      status: "completed",
      row_count: 1,
    });

    beforeEach(() => {
      setupListNotificationEndpoints({ card_id: MODEL.id }, []);
      mockGetBoundingClientRect({ width: 1200, height: 800 });
      mockOffsetHeightAndWidth(800);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("lists the table ID fields as foreign key targets in the model metadata editor (metabase#31663)", async () => {
      await setup({
        card: MODEL,
        database: SAMPLE_DB,
        dataset: DATASET,
        initialRoute: `/model/${MODEL.id}/columns`,
      });
      // The picker stays disabled until the ID fields arrive. `setup` registers
      // this endpoint without a delay, so the delayed one comes after it.
      setupDatabaseIdFieldsEndpoints({ database: SAMPLE_DB, delay: 1500 });

      const productIdHeader = (
        await screen.findAllByTestId("header-cell")
      ).find((header) => header.textContent === "Product ID");
      await userEvent.click(
        within(checkNotNull(productIdHeader)).getByText("Product ID"),
      );
      expect(await screen.findByLabelText("Display name")).toHaveValue(
        "Product ID",
      );
      const targetInput = await screen.findByRole("textbox", {
        name: "Foreign key target",
      });
      await waitFor(() => expect(targetInput).toBeEnabled());
      await userEvent.click(targetInput);

      const listbox = await screen.findByRole("listbox");
      ["Orders → ID", "People → ID", "Products → ID", "Reviews → ID"].forEach(
        (name) => {
          expect(within(listbox).getByText(name)).toBeInTheDocument();
        },
      );
      // The edited model is loaded, but its ID is not a target (metabase#31663)
      expect(within(listbox).queryByText(/Model → ID/)).not.toBeInTheDocument();
    });

    it("loads the model once and picks a line chart for questions based on it (metabase#31905, metabase#32963)", async () => {
      setupStructuredRuns({ model: MODEL, modelDataset: DATASET });
      await setup({ card: MODEL, dataset: DATASET, database: SAMPLE_DB });
      const cardFetches = fetchMock.callHistory.calls(
        `path:/api/card/${MODEL.id}`,
        { method: "GET" },
      );
      // QueryBuilder and the navbar each fetch the card
      expect(cardFetches.length).toBeGreaterThanOrEqual(1);
      expect(cardFetches.length).toBeLessThanOrEqual(2);

      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Summarize/,
        }),
      );
      const sidebar = await screen.findByTestId("sidebar-right");
      // The model's own column, listed before "Product → Created At"
      const [createdAt] = within(sidebar).getAllByText("Created At");
      await userEvent.click(createdAt);
      await userEvent.click(
        within(sidebar).getByRole("button", { name: "Done" }),
      );
      await waitForBreakoutRunAfter(0);
      await expectSelectedDisplay({ selected: "Line", other: "Table" });

      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByText("Orders Model"),
      );
      await expectSelectedDisplay({ selected: "Table" });

      const breakoutRunCount = getBreakoutRunCount();
      await userEvent.click(screen.getByTestId("notebook-button"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Summarize" }),
      );
      await userEvent.click(await screen.findByText("Count of rows"));
      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("Created At"),
      );
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
      await waitForBreakoutRunAfter(breakoutRunCount);
      await expectSelectedDisplay({ selected: "Line", other: "Table" });
    });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const ACK_KEY_URL =
  "path:/api/user-key-value/namespace/user_acknowledgement/key/turn_into_model_modal";

const ORDERS_BY_YEAR_CARD = createMockCard({
  id: 2,
  name: "Orders by year",
  display: "line",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
        },
      ],
    }),
  ),
});

const ORDERS_BY_YEAR_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createOrdersCreatedAtDatasetColumn({
        source: "breakout",
        unit: "year",
        display_name: "Created At: Year",
        field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      }),
      createMockNumericColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
        field_ref: ["aggregation", 0],
      }),
    ],
    rows: [
      ["2024-01-01T00:00:00Z", 10],
      ["2025-01-01T00:00:00Z", 20],
    ],
  }),
});

// A model is queried as a nested source, so its columns are referenced by name.
const ORDERS_BY_YEAR_MODEL_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createOrdersCreatedAtDatasetColumn({
        display_name: "Created At: Year",
        field_ref: ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
      }),
      createMockNumericColumn({
        name: "count",
        display_name: "Count",
        field_ref: ["field", "count", { "base-type": "type/BigInteger" }],
      }),
    ],
    rows: ORDERS_BY_YEAR_DATASET.data.rows,
  }),
});

const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

interface StatefulCardOpts {
  card: Card;
  questionDataset?: Dataset;
  modelDataset?: Dataset;
  /** Returned for a query that summarizes the model. */
  summarizedDataset?: Dataset;
}

/**
 * Keeps the card and the "turn into model" acknowledgement as the backend
 * would: each write changes them inside the handler of its request.
 */
function setupStatefulCard({
  card: initialCard,
  questionDataset = ORDERS_BY_YEAR_DATASET,
  modelDataset = ORDERS_BY_YEAR_MODEL_DATASET,
  summarizedDataset = modelDataset,
}: StatefulCardOpts) {
  let currentCard = initialCard;
  let acked = false;

  // Registered before `setup` so these routes win over its static card mocks.
  fetchMock.get(`path:/api/card/${initialCard.id}`, () => currentCard);
  fetchMock.put(`path:/api/card/${initialCard.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (typeof body === "object" && body !== null) {
      currentCard = Object.assign({}, currentCard, body);
    }
    return currentCard;
  });
  fetchMock.post(`path:/api/card/${initialCard.id}/query`, questionDataset);
  // A model opens as an ad-hoc query on top of the saved card.
  fetchMock.post("path:/api/dataset", (call) => {
    const stage = getFirstStage(JSON.parse(String(call.options.body)));
    if (getSourceCardId(call.options.body) !== initialCard.id) {
      return createMockDataset();
    }
    return typeof stage === "object" && stage !== null && "aggregation" in stage
      ? summarizedDataset
      : modelDataset;
  });
  fetchMock.get(ACK_KEY_URL, () => jsonResponse(acked));
  fetchMock.put(ACK_KEY_URL, () => {
    acked = true;
    return jsonResponse(true);
  });
  setupListNotificationEndpoints({ card_id: initialCard.id }, []);
}

function getFirstStage(query: unknown): unknown {
  if (
    typeof query === "object" &&
    query !== null &&
    "stages" in query &&
    Array.isArray(query.stages)
  ) {
    const [stage]: unknown[] = query.stages;
    return stage;
  }
}

function getSourceCardId(body: unknown) {
  const query: unknown = JSON.parse(String(body));
  if (
    typeof query === "object" &&
    query !== null &&
    "stages" in query &&
    Array.isArray(query.stages)
  ) {
    const [stage]: unknown[] = query.stages;
    if (typeof stage === "object" && stage !== null && "source-card" in stage) {
      return stage["source-card"];
    }
  }
}

function getCreatedQuerySourceCardId(card: unknown) {
  if (typeof card === "object" && card !== null && "dataset_query" in card) {
    return getSourceCardId(JSON.stringify(card.dataset_query));
  }
}

function getCardUpdates(cardId: number): unknown[] {
  return fetchMock.callHistory
    .calls(`path:/api/card/${cardId}`, { method: "PUT" })
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

async function openActionsMenu() {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  return screen.findByRole("menu");
}

/** Waits for every mocked response to be read, so the QB has applied it. */
async function settleRequests() {
  await act(() => fetchMock.callHistory.flush(true));
}

function getDatasetQueries(): unknown[] {
  return fetchMock.callHistory
    .calls("path:/api/dataset")
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

async function closeActionsMenu() {
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
}

async function expectToBeQuestion() {
  const menu = await openActionsMenu();
  expect(
    await within(menu).findByRole("menuitem", { name: /Turn into a model/ }),
  ).toBeInTheDocument();
  expect(
    within(menu).queryByRole("menuitem", {
      name: /Turn back to saved question/,
    }),
  ).not.toBeInTheDocument();
  await closeActionsMenu();
  expect(
    within(screen.getByTestId("qb-header-left-side")).getByText(
      "Sample Database",
    ),
  ).toBeInTheDocument();
}

async function expectToBeModel() {
  const menu = await openActionsMenu();
  expect(
    await within(menu).findByRole("menuitem", {
      name: /Turn back to saved question/,
    }),
  ).toBeInTheDocument();
  expect(
    within(menu).queryByRole("menuitem", { name: /Turn into a model/ }),
  ).not.toBeInTheDocument();
  await closeActionsMenu();
  expect(
    within(screen.getByTestId("qb-header-left-side")).queryByText(
      "Sample Database",
    ),
  ).not.toBeInTheDocument();
}

describe("QueryBuilder > models", () => {
  describe("turning a question into a model", () => {
    it("turns a question into a model, undoes it, and shows the model info modal only once", async () => {
      const card = ORDERS_BY_YEAR_CARD;
      setupStatefulCard({ card });
      await setup({ card, dataset: ORDERS_BY_YEAR_DATASET, withUndos: true });

      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
      expect(screen.queryByTestId("table-root")).not.toBeInTheDocument();

      const menu = await openActionsMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Turn into a model/ }),
      );
      // On 65, the modal has no accessible name
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByRole("heading", { name: "Models" }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Turn this into a model" }),
      );

      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(1));
      expect(getCardUpdates(card.id)[0]).toMatchObject({
        type: "model",
        display: "table",
      });
      expect(await screen.findByTestId("table-root")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-container")).not.toBeInTheDocument();
      await expectToBeModel();

      const toast = await screen.findByTestId("toast-undo");
      expect(within(toast).getByText("This is a model now.")).toBeVisible();
      await userEvent.click(within(toast).getByText("Undo"));

      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(2));
      expect(getCardUpdates(card.id)[1]).toMatchObject({
        type: "question",
        display: "line",
      });
      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
      await expectToBeQuestion();

      const menu2 = await openActionsMenu();
      await userEvent.click(
        within(menu2).getByRole("menuitem", { name: /Turn into a model/ }),
      );
      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(3));
      expect(getCardUpdates(card.id)[2]).toMatchObject({ type: "model" });
      expect(await screen.findByTestId("table-root")).toBeInTheDocument();
      expect(
        within(await screen.findByTestId("toast-undo")).getByText(
          "This is a model now.",
        ),
      ).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("turning a model back into a question", () => {
    it("opens a model by its /question URL at its /model URL, turns it back into a question, and undoes it", async () => {
      const card = createMockCard({
        ...ORDERS_BY_YEAR_CARD,
        name: "Orders model",
        type: "model",
        display: "table",
      });
      setupStatefulCard({ card });
      const { router } = await setup({
        card,
        initialRoute: `/question/${card.id}`,
        withUndos: true,
      });

      await waitFor(() =>
        expect(router.location.pathname).toBe(`/model/${card.id}-orders-model`),
      );
      await expectToBeModel();

      const menu = await openActionsMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: /Turn back to saved question/,
        }),
      );
      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(1));
      expect(getCardUpdates(card.id)[0]).toMatchObject({ type: "question" });

      const toast = await screen.findByTestId("toast-undo");
      expect(within(toast).getByText("This is a question now.")).toBeVisible();
      await expectToBeQuestion();

      await userEvent.click(within(toast).getByText("Undo"));
      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(2));
      expect(getCardUpdates(card.id)[1]).toMatchObject({ type: "model" });
      await waitFor(() =>
        expect(
          within(screen.getByTestId("qb-header-left-side")).queryByText(
            "Sample Database",
          ),
        ).not.toBeInTheDocument(),
      );
      await expectToBeModel();
    });
  });

  describe("native questions", () => {
    const NATIVE_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "ID",
            display_name: "ID",
            field_ref: ["field", "ID", { "base-type": "type/BigInteger" }],
          }),
        ],
        rows: [[1], [2]],
      }),
    });

    function createNativeCard(opts: {
      query: string;
      templateTags?: TemplateTag[];
      type?: CardType;
    }) {
      return createMockCard({
        id: 4,
        name: "Native question",
        type: opts.type ?? "question",
        dataset_query: Lib.toJsQuery(
          Lib.withTemplateTags(
            Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: opts.query }),
            Object.fromEntries(
              (opts.templateTags ?? []).map((tag) => [tag.name, tag]),
            ),
          ),
        ),
      });
    }

    it("does not turn a native question with variables into a model", async () => {
      const card = createNativeCard({
        query: "SELECT * FROM PRODUCTS WHERE {{ID}}",
        templateTags: [
          createMockTemplateTag({
            name: "ID",
            "display-name": "ID",
            type: "dimension",
            dimension: ["field", PRODUCTS.ID, null],
            "widget-type": "category",
          }),
        ],
      });
      setupStatefulCard({
        card,
        questionDataset: NATIVE_DATASET,
        modelDataset: NATIVE_DATASET,
      });
      await setup({ card, dataset: NATIVE_DATASET });

      const menu = await openActionsMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Turn into a model/ }),
      );
      // On 65, the modal has no accessible name
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByRole("heading", {
          name: "Variables in models aren't supported yet",
        }),
      ).toBeInTheDocument();
      expect(
        within(modal).queryByRole("button", { name: "Turn this into a model" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("img", { name: "close icon" }),
      );
      await waitFor(() => expect(modal).not.toBeInTheDocument());

      await expectToBeQuestion();
      expect(getCardUpdates(card.id)).toHaveLength(0);
    });

    it("turns a native question that references another card into a model", async () => {
      setupCardEndpoints(createMockCard({ id: 1, name: "Orders" }));
      const card = createNativeCard({
        query: "SELECT * FROM {{#1-orders}}",
        templateTags: [
          createMockTemplateTag({
            name: "#1-orders",
            "display-name": "#1 Orders",
            type: "card",
            "card-id": 1,
          }),
        ],
      });
      setupStatefulCard({
        card,
        questionDataset: NATIVE_DATASET,
        modelDataset: NATIVE_DATASET,
      });
      await setup({ card, dataset: NATIVE_DATASET });

      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("This question is written in SQL."),
      ).toBeVisible();

      const menu = await openActionsMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Turn into a model/ }),
      );
      // On 65, the modal has no accessible name
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByRole("heading", { name: "Models" }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Turn this into a model" }),
      );

      await waitFor(() => expect(getCardUpdates(card.id)).toHaveLength(1));
      expect(getCardUpdates(card.id)[0]).toMatchObject({ type: "model" });
      await settleRequests();
      await expectToBeModel();
      expect(
        screen.queryByTestId("mock-native-query-editor"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("This question is written in SQL."),
      ).not.toBeInTheDocument();
    });

    it("does not open the variables sidebar when a variable is typed in a native model", async () => {
      const card = createNativeCard({
        query: "SELECT * FROM PRODUCTS",
        type: "model",
      });
      setupStatefulCard({
        card,
        questionDataset: NATIVE_DATASET,
        modelDataset: NATIVE_DATASET,
      });
      await setup({
        card,
        dataset: NATIVE_DATASET,
        initialRoute: `/model/${card.id}/query`,
      });

      await typeInNativeEditor(" WHERE {{F}}");

      expect(
        within(screen.getByTestId("mock-native-query-editor")).getByRole(
          "textbox",
        ),
      ).toHaveValue("SELECT * FROM PRODUCTS WHERE {{F}}");
      expect(screen.getByTestId("dataset-edit-bar")).toBeInTheDocument();
      expect(
        screen.queryByTestId("tag-editor-sidebar"),
      ).not.toBeInTheDocument();
    });

    it("opens the variables sidebar when a variable is typed in a native question", async () => {
      await setup({
        card: createMockUnsavedCard({
          dataset_query: Lib.toJsQuery(
            Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
              query: "SELECT * FROM PRODUCTS",
            }),
          ),
        }),
        dataset: NATIVE_DATASET,
      });

      await typeInNativeEditor(" WHERE {{F}}");

      expect(
        await screen.findByTestId("tag-editor-sidebar"),
      ).toBeInTheDocument();
    });
  });
});

describe("QueryBuilder > creating a native model", () => {
  it("disables the columns tab until the query runs, and confirms before leaving", async () => {
    // A new model is an unsaved card that the URL marks as a model.
    const card = {
      ...createMockUnsavedCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: "" }),
        ),
      }),
      type: "model",
    };
    const { router } = await setup({
      card,
      initialRoute: `/model/query#${serializeCardForUrl(card)}`,
    });

    const editBar = await screen.findByTestId("dataset-edit-bar");
    expect(screen.getByTestId("editor-tabs-columns")).toBeDisabled();

    await userEvent.click(
      within(editBar).getByRole("button", { name: "Cancel" }),
    );
    const modal = await screen.findByTestId("leave-confirmation");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(router.location.pathname).toBe("/"));
  });
});

describe("QueryBuilder > questions based on a model", () => {
  const MODEL_COLUMNS = createOrdersTableDatasetColumns();
  const ORDERS_MODEL = createMockCard({
    id: 2,
    name: "Orders Model",
    type: "model",
    display: "table",
    result_metadata: toResultMetadata(MODEL_COLUMNS),
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    ),
  });
  const ORDERS_MODEL_DATASET = createMockDataset({
    data: createMockDatasetData({
      cols: MODEL_COLUMNS,
      rows: [MODEL_COLUMNS.map(() => 1)],
    }),
  });
  const COUNT_BY_MONTH_DATASET = createMockDataset({
    data: createMockDatasetData({
      cols: [
        createOrdersCreatedAtDatasetColumn({
          source: "breakout",
          unit: "month",
          display_name: "Created At: Month",
          field_ref: [
            "field",
            "CREATED_AT",
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        }),
        createMockNumericColumn({
          name: "count",
          display_name: "Count",
          source: "aggregation",
          field_ref: ["aggregation", 0],
        }),
      ],
      rows: [
        ["2025-01-01T00:00:00Z", 10],
        ["2025-02-01T00:00:00Z", 20],
      ],
    }),
  });
  const SAVED_QUESTION_ID = 3;
  // Runs each change of a question at once, like a database with auto-run on.
  const AUTO_RUN_DB = { ...TEST_DB, auto_run_queries: true };

  /**
   * Saves a new card as the backend would: the created card gets an id and is
   * then served by its own endpoints.
   */
  function setupCardCreation() {
    let createdCard: Card | undefined;
    fetchMock.post("path:/api/card", (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      createdCard = createMockCard(
        Object.assign({}, body, { id: SAVED_QUESTION_ID }),
      );
      return createdCard;
    });
    fetchMock.get(`path:/api/card/${SAVED_QUESTION_ID}`, () =>
      createdCard ? createdCard : { status: 404 },
    );
    fetchMock.post(
      `path:/api/card/${SAVED_QUESTION_ID}/query`,
      ORDERS_MODEL_DATASET,
    );
    setupCardQueryMetadataEndpoint(
      createMockCard({ id: SAVED_QUESTION_ID }),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    setupListNotificationEndpoints({ card_id: SAVED_QUESTION_ID }, []);
  }

  async function setupModel() {
    setupStatefulCard({
      card: ORDERS_MODEL,
      modelDataset: ORDERS_MODEL_DATASET,
      summarizedDataset: COUNT_BY_MONTH_DATASET,
    });
    setupCardCreation();
    return setup({
      card: ORDERS_MODEL,
      database: AUTO_RUN_DB,
      initialRoute: `/model/${ORDERS_MODEL.id}`,
    });
  }

  function getCreatedCards(): unknown[] {
    return fetchMock.callHistory
      .calls("path:/api/card", { method: "POST" })
      .map((call): unknown => JSON.parse(String(call.options.body)));
  }

  function expectHeaderToShowModelSource({
    modelName = ORDERS_MODEL.name,
  }: { modelName?: string } = {}) {
    const header = screen.getByTestId("qb-header");
    expect(within(header).getAllByText("Our analytics").length).toBeGreaterThan(
      0,
    );
    expect(within(header).getByText(modelName)).toBeInTheDocument();
    expect(
      within(header).queryByText("Sample Database"),
    ).not.toBeInTheDocument();
    expect(within(header).queryByText("Orders")).not.toBeInTheDocument();
  }

  /** The last run is a filtered query on top of the model. */
  function expectLastRunToBeFilteredModel({
    modelId = ORDERS_MODEL.id,
    hasAggregation,
  }: {
    modelId?: number;
    hasAggregation: boolean;
  }) {
    const stage = getFirstStage(getDatasetQueries().at(-1));
    expect(stage).toMatchObject({ "source-card": modelId });
    expect(stage).toHaveProperty("filters");
    if (hasAggregation) {
      expect(stage).toHaveProperty("aggregation");
      expect(stage).toHaveProperty("breakout");
    } else {
      expect(stage).not.toHaveProperty("aggregation");
    }
  }

  async function saveAsNewQuestion(name: string) {
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const modal = await screen.findByTestId("save-question-modal");
    expect(
      within(modal).queryByText(/Replace original question/),
    ).not.toBeInTheDocument();
    const nameInput = within(modal).getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, name);
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(modal).not.toBeInTheDocument());
  }

  it("filters and summarizes a model, and saves the result as a question based on it", async () => {
    const { router } = await setupModel();
    const initialRuns = getDatasetQueries().length;

    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    const popover = await screen.findByRole("dialog");
    await userEvent.click(within(popover).getByText("Discount"));
    await userEvent.type(within(popover).getByPlaceholderText("Min"), "1");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Apply filter" }),
    );
    await waitFor(() =>
      expect(getDatasetQueries()).toHaveLength(initialRuns + 1),
    );
    expectLastRunToBeFilteredModel({ hasAggregation: false });
    await waitFor(() => expectHeaderToShowModelSource());

    const filteredRuns = getDatasetQueries().length;
    await userEvent.click(screen.getByRole("button", { name: /Summarize/ }));
    const sidebar = await screen.findByTestId("sidebar-right");
    const [createdAtItem] = within(sidebar)
      .getAllByTestId("dimension-list-item")
      .filter((item) => within(item).queryByText("Created At"));
    await userEvent.click(within(createdAtItem).getByText("Created At"));
    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Done" }),
    );

    expect(
      await within(screen.getByTestId("qb-header")).findByText(
        "Count by Created At: Month",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getDatasetQueries().length).toBeGreaterThan(filteredRuns),
    );
    expectLastRunToBeFilteredModel({ hasAggregation: true });
    expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
    expectHeaderToShowModelSource();

    await saveAsNewQuestion("Q1");

    expect(getCreatedCards()).toHaveLength(1);
    const [createdCard] = getCreatedCards();
    expect(createdCard).toMatchObject({ name: "Q1", type: "question" });
    expect(getCreatedQuerySourceCardId(createdCard)).toBe(ORDERS_MODEL.id);
    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/question/${SAVED_QUESTION_ID}-q1`,
      ),
    );
    expect(await screen.findByDisplayValue("Q1")).toBeInTheDocument();
    await waitFor(() => expectHeaderToShowModelSource());
  });

  it("renames a model and edits its description", async () => {
    setupRevisionsEndpoints([]);
    setupUsersEndpoints([createMockUserListResult()]);
    await setupModel();

    const title = screen.getByTestId("saved-question-header-title");
    await userEvent.clear(title);
    await userEvent.type(title, "M1");
    await userEvent.tab();
    await waitFor(() =>
      expect(getCardUpdates(ORDERS_MODEL.id)).toHaveLength(1),
    );
    expect(getCardUpdates(ORDERS_MODEL.id)[0]).toMatchObject({ name: "M1" });
    await settleRequests();
    expect(screen.getByDisplayValue("M1")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("qb-header-info-button"));
    const description = await screen.findByPlaceholderText("Add description");
    await userEvent.type(description, "foo");
    await userEvent.tab();
    await waitFor(() =>
      expect(getCardUpdates(ORDERS_MODEL.id)).toHaveLength(2),
    );
    expect(getCardUpdates(ORDERS_MODEL.id)[1]).toMatchObject({
      name: "M1",
      description: "foo",
    });
    await settleRequests();

    expect(screen.getByDisplayValue("M1")).toBeInTheDocument();
    expect(screen.getByText("foo")).toBeInTheDocument();
  });

  it("links a question to the archived model it is based on (metabase#52071)", async () => {
    const archivedModel = createMockCard({
      ...ORDERS_MODEL,
      name: "Accounts Model",
      archived: true,
    });
    const question = createMockCard({
      id: 5,
      name: "Accounts Model Quest",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(
          createMetadataProvider({
            metadata: createMockMetadata({
              databases: [TEST_DB],
              questions: [archivedModel],
            }),
          }),
          { stages: [{ source: { type: "card", id: archivedModel.id } }] },
        ),
      ),
    });
    setupCardEndpoints(archivedModel);
    // Registered before `setup` so the source model is part of the metadata.
    fetchMock.get(
      `path:/api/card/${question.id}/query_metadata`,
      // The response also carries the source model, which the type leaves out.
      Object.assign(createMockCardQueryMetadata({ databases: [TEST_DB] }), {
        cards: [archivedModel],
      }),
    );
    setupListNotificationEndpoints({ card_id: question.id }, []);
    await setup({ card: question, dataset: ORDERS_MODEL_DATASET });

    const header = screen.getByTestId("qb-header-left-side");
    expect(
      await within(header).findByRole("link", { name: /Accounts Model/ }),
    ).toHaveAttribute("href", `/model/${archivedModel.id}-accounts-model`);
    expect(within(header).getByLabelText("warning icon")).toBeInTheDocument();
  });

  it("saves a new question based on a model into the dashboard the user picked last", async () => {
    const dashboardId = 7;
    const dashboard = createMockDashboard({
      id: dashboardId,
      name: "Orders in a dashboard",
      collection_id: null,
      tabs: [],
    });
    setupDashboardEndpoints(dashboard);
    // Registered before `setup` so these routes win over its empty mocks.
    setupRecentViewsAndSelectionsEndpoints(
      [
        createMockRecentCollectionItem({
          id: dashboardId,
          model: "dashboard",
          name: dashboard.name,
          can_write: true,
        }),
      ],
      ["selections"],
    );
    fetchMock.post(
      "path:/api/dataset/query_metadata",
      // The response also carries the source model, which the type leaves out.
      Object.assign(createMockCardQueryMetadata({ databases: [TEST_DB] }), {
        cards: [ORDERS_MODEL],
      }),
    );
    setupStatefulCard({
      card: ORDERS_MODEL,
      modelDataset: ORDERS_MODEL_DATASET,
    });
    setupCardCreation();
    const { router } = await setup({
      card: createMockUnsavedCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(
            createMetadataProvider({
              metadata: createMockMetadata({
                databases: [TEST_DB],
                questions: [ORDERS_MODEL],
              }),
            }),
            { stages: [{ source: { type: "card", id: ORDERS_MODEL.id } }] },
          ),
        ),
      }),
    });

    await waitFor(() => expectHeaderToShowModelSource());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const modal = await screen.findByTestId("save-question-modal");
    await waitFor(() =>
      expect(
        within(modal).getByLabelText("Where do you want to save this?"),
      ).toHaveTextContent(dashboard.name),
    );
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(getCreatedCards()).toHaveLength(1));
    const [createdCard] = getCreatedCards();
    expect(createdCard).toMatchObject({ dashboard_id: dashboard.id });
    expect(getCreatedQuerySourceCardId(createdCard)).toBe(ORDERS_MODEL.id);
    await waitFor(() =>
      expect(router.location.pathname).toMatch(
        new RegExp(`^/dashboard/${dashboard.id}-[a-z0-9-]*$`),
      ),
    );
  });

  it("filters a native model and saves the result as a question based on it", async () => {
    const nativeColumns = [
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name: "ID",
        display_name: "ID",
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
        semantic_type: "type/PK",
        field_ref: ["field", "ID", { "base-type": "type/BigInteger" }],
      }),
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name: "PRICE",
        display_name: "PRICE",
        base_type: "type/Float",
        effective_type: "type/Float",
        field_ref: ["field", "PRICE", { "base-type": "type/Float" }],
      }),
    ];
    const nativeModel = createMockCard({
      id: ORDERS_MODEL.id,
      name: "Product Model",
      type: "model",
      display: "table",
      result_metadata: toResultMetadata(nativeColumns),
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
          query: "SELECT * FROM PRODUCTS",
        }),
      ),
    });
    setupStatefulCard({
      card: nativeModel,
      modelDataset: createMockDataset({
        data: createMockDatasetData({ cols: nativeColumns, rows: [[1, 10]] }),
      }),
    });
    setupCardCreation();
    const { router } = await setup({
      card: nativeModel,
      database: AUTO_RUN_DB,
      initialRoute: `/model/${nativeModel.id}`,
    });
    const initialRuns = getDatasetQueries().length;

    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    const popover = await screen.findByRole("dialog");
    await userEvent.click(within(popover).getByText("PRICE"));
    await userEvent.type(within(popover).getByPlaceholderText("Min"), "1");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Apply filter" }),
    );
    await waitFor(() =>
      expect(getDatasetQueries()).toHaveLength(initialRuns + 1),
    );
    expectLastRunToBeFilteredModel({
      modelId: nativeModel.id,
      hasAggregation: false,
    });
    await waitFor(() =>
      expectHeaderToShowModelSource({ modelName: "Product Model" }),
    );

    await saveAsNewQuestion("Q1");

    const [createdCard] = getCreatedCards();
    expect(createdCard).toMatchObject({ name: "Q1", type: "question" });
    expect(getCreatedQuerySourceCardId(createdCard)).toBe(nativeModel.id);
    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/question/${SAVED_QUESTION_ID}-q1`,
      ),
    );
    expect(await screen.findByDisplayValue("Q1")).toBeInTheDocument();
    await waitFor(() =>
      expectHeaderToShowModelSource({ modelName: "Product Model" }),
    );
  });

  it("creates a question from a model with a column action, and saves it as a question based on the model", async () => {
    // Gives the virtualized table a size, so that it renders its columns.
    mockGetBoundingClientRect();
    const { router } = await setupModel();

    await userEvent.click(
      within(await screen.findByTestId("table-header")).getByText("Subtotal"),
    );
    await userEvent.click(await screen.findByText("Sum over time"));

    expect(
      await within(screen.getByTestId("qb-header")).findByText(
        "Sum of Subtotal by Created At: Month",
      ),
    ).toBeInTheDocument();
    expectHeaderToShowModelSource();

    await saveAsNewQuestion("Q2");

    const [createdCard] = getCreatedCards();
    expect(createdCard).toMatchObject({ name: "Q2", type: "question" });
    expect(getCreatedQuerySourceCardId(createdCard)).toBe(ORDERS_MODEL.id);
    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/question/${SAVED_QUESTION_ID}-q2`,
      ),
    );
    await waitFor(() => expectHeaderToShowModelSource());
  });
});

/**
 * Pastes the whole text at once, like the real editor that closes the braces
 * of a variable as it is typed: a half-typed `{{` is not a valid query.
 */
async function typeInNativeEditor(text: string) {
  const editor = await screen.findByTestId("mock-native-query-editor");
  const textbox = within(editor).getByRole("textbox");
  await userEvent.click(textbox);
  await userEvent.paste(text);
  await userEvent.tab();
}
