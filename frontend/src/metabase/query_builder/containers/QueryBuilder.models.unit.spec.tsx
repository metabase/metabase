import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseIdFieldsEndpoints } from "__support__/server-mocks";
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
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  Field,
  TableId,
  TestJoinSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
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
