import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCardQueryMetadataEndpoint,
  setupModelIndexEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  mockGetBoundingClientRect,
  mockOffsetHeightAndWidth,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  Field,
  RowValues,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { TEST_DB, setup } from "./test-utils";

// The real editor, so the tests click its own Run button. CodeMirror stays a textarea.
jest.unmock("metabase/querying/components/NativeQueryEditor");

registerVisualizations();

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

const NATIVE_COLUMN = (name: string) =>
  createMockColumn({
    name,
    display_name: name,
    source: "native",
    field_ref: ["field", name, { "base-type": "type/Text" }],
    base_type: "type/Text",
    effective_type: "type/Text",
  });

const createNativeDataset = (
  cols: DatasetColumn[],
  rows: RowValues[],
): Dataset =>
  createMockDataset({
    data: { cols, rows },
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: rows.length,
  });

const createNativeModel = (query: string, cols: DatasetColumn[]) =>
  createMockCard({
    id: 1,
    name: "Native model",
    type: "model",
    display: "table",
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query }),
    result_metadata: toResultMetadata(cols),
  });

/** Gets the serialized query of a run or a saved card, returns its results. */
type DatasetForQuery = (serializedQuery: string) => Dataset;

/**
 * Keeps the saved model in one place, as the backend does: `PUT /api/card/:id`
 * stores the request body, and later reads and runs of the card see it.
 * Ad-hoc runs return the dataset for the query in the request body, or for
 * the saved query when they run the model itself.
 */
const setupNativeModelBackend = ({
  model,
  datasetForQuery,
}: {
  model: Card;
  datasetForQuery: DatasetForQuery;
}) => {
  let storedCard = model;

  fetchMock.get(`path:/api/card/${model.id}`, () => storedCard);
  fetchMock.put(`path:/api/card/${model.id}`, (call) => {
    const changes: unknown = JSON.parse(String(call.options.body));
    storedCard = Object.assign({}, storedCard, changes);
    return storedCard;
  });
  const runStoredCard = () =>
    datasetForQuery(JSON.stringify(storedCard.dataset_query));

  fetchMock.post(`path:/api/card/${model.id}/query`, runStoredCard);
  fetchMock.post("path:/api/dataset", (call) => {
    const body = String(call.options.body);
    // A query on top of the model runs the saved model query
    return body.includes(`"source-card":${model.id}`)
      ? runStoredCard()
      : datasetForQuery(body);
  });
};

const getLastRequestBody = (url: string, method: "POST" | "PUT"): unknown => {
  const call = checkNotNull(fetchMock.callHistory.lastCall(url, { method }));
  return JSON.parse(String(call.options.body));
};

const getEditBarButton = (name: string) =>
  within(screen.getByTestId("dataset-edit-bar")).getByRole("button", { name });

/**
 * Clicks the editor's own Run button. While a query runs, the same button is
 * "Cancel", so this waits until it runs the changed query.
 */
const runQueryFromEditor = async () => {
  const editor = await screen.findByTestId("native-query-editor-container");
  await userEvent.click(
    await within(editor).findByRole("button", { name: "Get Answer" }),
  );
};

/** Hovers the enabled Save button: the "run the query first" tooltip is gone. */
const expectSaveNoLongerBlocked = async (name: string) => {
  const saveButton = getEditBarButton(name);
  expect(saveButton).toBeEnabled();
  await userEvent.hover(saveButton);
  expect(
    screen.queryByText("You must run the query before you can save this model"),
  ).not.toBeInTheDocument();
};

const expectSaveBlockedUntilRun = async (name: string) => {
  const saveButton = getEditBarButton(name);
  expect(saveButton).toBeDisabled();
  await userEvent.hover(saveButton);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "You must run the query before you can save this model",
  );
  await userEvent.unhover(saveButton);
};

const expectCellWithText = (text: string) =>
  waitFor(() =>
    expect(
      screen.getAllByTestId("cell-data").map((cell) => cell.textContent),
    ).toContain(text),
  );

const typeInNativeEditor = async (text: string) => {
  const textbox = within(
    await screen.findByTestId("native-query-editor-container"),
  ).getByRole("textbox");
  await userEvent.type(textbox, text);
};

describe("QueryBuilder > native models", () => {
  describe("native model query editor", () => {
    const COLS = [NATIVE_COLUMN("ID"), NATIVE_COLUMN("FOO")];
    const MODEL = createNativeModel("select 1 id, 'a' foo", COLS);
    const DATASET = createNativeDataset(COLS, [["1", "a"]]);

    beforeEach(() => {
      setupListNotificationEndpoints({ card_id: MODEL.id }, []);
      setupNativeQuerySnippetEndpoints();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("keeps the model results after leaving the query editor (metabase#19180)", async () => {
      mockGetBoundingClientRect({ width: 1200, height: 800 });
      mockOffsetHeightAndWidth(800);
      const { router } = await setup({
        card: MODEL,
        dataset: DATASET,
        initialRoute: `/model/${MODEL.id}/query`,
      });

      await userEvent.click(getEditBarButton("Cancel"));

      await waitFor(() =>
        expect(router.location.pathname).not.toMatch(/\/query$/),
      );
      await expectCellWithText("a");
      expect(
        screen.queryByText("Here's where your results will appear"),
      ).not.toBeInTheDocument();
    });

    it("shows the new columns right after the model query changes are saved (metabase#22518)", async () => {
      const NEW_COLS = [...COLS, NATIVE_COLUMN("BAR")];
      setupNativeModelBackend({
        model: MODEL,
        datasetForQuery: (query) =>
          query.includes("'b' bar")
            ? createNativeDataset(NEW_COLS, [["1", "a", "b"]])
            : DATASET,
      });
      await setup({ card: MODEL, dataset: DATASET });

      await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
      await userEvent.click(await screen.findByText("Edit query definition"));
      await typeInNativeEditor(", 'b' bar");
      await runQueryFromEditor();
      await waitFor(() =>
        expect(getEditBarButton("Save changes")).toBeEnabled(),
      );
      await userEvent.click(getEditBarButton("Save changes"));

      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      expect(
        getLastRequestBody(`path:/api/card/${MODEL.id}`, "PUT"),
      ).toMatchObject({
        result_metadata: [{ name: "ID" }, { name: "FOO" }, { name: "BAR" }],
      });
      const headers = await screen.findAllByTestId("header-cell");
      expect(headers.map((header) => header.textContent)).toEqual([
        "ID",
        "FOO",
        "BAR",
      ]);

      await userEvent.click(screen.getByRole("button", { name: /Summarize/ }));
      const sidebar = await screen.findByTestId("sidebar-right");
      expect(within(sidebar).getByText("ID")).toBeInTheDocument();
      expect(within(sidebar).getByText("FOO")).toBeInTheDocument();
      expect(within(sidebar).getByText("BAR")).toBeInTheDocument();
    });

    it("saves the model metadata of a changed query and shows all its columns (metabase#35039, metabase#37009)", async () => {
      const PRODUCT_COLS = [
        "ID",
        "EAN",
        "TITLE",
        "CATEGORY",
        "VENDOR",
        "PRICE",
        "RATING",
        "CREATED_AT",
      ].map(NATIVE_COLUMN);
      const PRODUCT_ROW = [
        "1",
        "1018947080336",
        "Rustic Paper Wallet",
        "Gizmo",
        "Swaniawski, Casper and Hilll",
        "29.46",
        "4.6",
        "2023-07-19",
      ];
      // Created through the API, so the model has no result_metadata yet
      const model = {
        ...createNativeModel("select * from products limit 1 -- foo", []),
        result_metadata: null,
      };
      setupNativeModelBackend({
        model,
        datasetForQuery: (query) =>
          query.includes("select * from products limit 1 -- fo")
            ? createNativeDataset(PRODUCT_COLS, [PRODUCT_ROW])
            : createNativeDataset([], []),
      });
      // The results table renders its cells only when it has a size
      mockGetBoundingClientRect({ width: 1200, height: 800 });
      mockOffsetHeightAndWidth(800);
      await setup({
        card: model,
        initialRoute: `/model/${model.id}/query`,
      });
      await expectCellWithText("Rustic Paper Wallet");

      await typeInNativeEditor("{backspace}");
      await expectSaveBlockedUntilRun("Save changes");
      await runQueryFromEditor();
      await waitFor(() =>
        expect(getEditBarButton("Save changes")).toBeEnabled(),
      );
      await expectSaveNoLongerBlocked("Save changes");
      await userEvent.click(getEditBarButton("Save changes"));

      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      expect(
        getLastRequestBody(`path:/api/card/${model.id}`, "PUT"),
      ).toMatchObject({
        result_metadata: PRODUCT_COLS.map(({ name }) => ({ name })),
      });
      await expectCellWithText("Rustic Paper Wallet");

      await userEvent.click(screen.getByTestId("notebook-button"));
      await userEvent.click(await screen.findByTestId("fields-picker"));
      const popover = await screen.findByRole("dialog");
      PRODUCT_COLS.forEach(({ name }) => {
        expect(within(popover).getByText(name)).toBeInTheDocument();
      });
    });

    it("saves a new model only after its query runs, with the result metadata (metabase#37009)", async () => {
      const QUERY = "select 1 id, 'a' foo";
      // What "New" > "Model" > "Use a native query" opens
      const newModel = {
        ...createMockUnsavedCard({
          display: "table",
          dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
            query: "",
          }),
        }),
        type: "model",
      };
      setupCardCreateEndpoint();
      setupModelIndexEndpoints(MODEL.id, []);
      setupCardQueryMetadataEndpoint(
        createMockCard(),
        createMockCardQueryMetadata({ databases: [TEST_DB] }),
      );
      fetchMock.post("path:/api/dataset", (call) =>
        String(call.options.body).includes(QUERY)
          ? DATASET
          : createNativeDataset([], []),
      );
      const { router } = await setup({
        card: newModel,
        initialRoute: `/model/query#${serializeCardForUrl(newModel)}`,
      });

      await typeInNativeEditor(QUERY);
      await expectSaveBlockedUntilRun("Save");
      await runQueryFromEditor();
      await waitFor(() => expect(getEditBarButton("Save")).toBeEnabled());
      await expectSaveNoLongerBlocked("Save");
      await userEvent.click(getEditBarButton("Save"));
      const modal = await screen.findByTestId("save-question-modal");
      await userEvent.type(within(modal).getByLabelText("Name"), "Model");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("path:/api/card", { method: "POST" }),
        ).toHaveLength(1),
      );
      expect(getLastRequestBody("path:/api/card", "POST")).toMatchObject({
        name: "Model",
        type: "model",
        result_metadata: [{ name: "ID" }, { name: "FOO" }],
      });
      await waitFor(() =>
        expect(router.location.pathname).toMatch(/^\/model\/1-/),
      );
    });
  });
});
