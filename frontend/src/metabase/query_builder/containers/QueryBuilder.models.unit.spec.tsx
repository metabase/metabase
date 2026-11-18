import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { act, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { TableId, TestJoinSpec } from "metabase-types/api";
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
} from "metabase-types/api/mocks/presets";

import { TEST_COLLECTION, TEST_DB, setup } from "./test-utils";

registerVisualizations();

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

  mockGetBoundingClientRect();

  beforeEach(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    window.history.replaceState(null, "", "/");

    jest.resetAllMocks();
    setupJestCanvasMock();
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
      query_type: "native",
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
      result_metadata: PRODUCTS_COLUMNS,
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
      result_metadata: ORDERS_COLUMNS,
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    });
    await setup({
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
  });

  it("renders the correct query and editor tabs after using the back and forward buttons in a model (metabase#56775, metabase#55486)", async () => {
    const model = createMockCard({
      id: 1,
      name: "Model 56775",
      type: "model",
      display: "table",
      result_metadata: PRODUCTS_COLUMNS,
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
    const newModel = Question.create({
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
    await setup({
      card: null,
      initialRoute: Urls.newQuestion(newModel, {
        mode: "query",
        creationType: "custom_question",
      }),
    });
    const sortedByOrdersTotal = expect.objectContaining({
      stages: [
        expect.objectContaining({
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
        : createMockDataset({ database_id: SAMPLE_DB_ID });
    });

    await userEvent.click(
      within(await screen.findByTestId("action-buttons")).getByText("Sort"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByText("Total"),
    );
    const sortStep = await screen.findByTestId("step-sort-0-0");
    expect(within(sortStep).getByText("Total")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("run-button"));

    const runCall = await waitFor(() =>
      checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      ),
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
      query_type: "native",
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
