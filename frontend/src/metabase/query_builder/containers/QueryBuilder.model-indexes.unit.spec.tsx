import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupStatefulModelIndexEndpoints,
} from "__support__/server-mocks";
import { act, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import type { State } from "metabase/redux/store";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { DatasetColumn, Field } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import { PRODUCTS, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToFinish } from "./test-utils";

const CREATED_INDEX_ID = 7;

registerVisualizations();

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

const MODEL_ID = 1;
const MODEL_SLUG = `${MODEL_ID}-products-model`;

const ID_COLUMN = createMockColumn({
  name: "ID",
  display_name: "ID",
  id: PRODUCTS.ID,
  table_id: PRODUCTS_ID,
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  semantic_type: "type/PK",
  field_ref: ["field", PRODUCTS.ID, null],
  source: "fields",
});

const TITLE_COLUMN = createMockColumn({
  name: "TITLE",
  display_name: "Title",
  id: PRODUCTS.TITLE,
  table_id: PRODUCTS_ID,
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Title",
  field_ref: ["field", PRODUCTS.TITLE, null],
  source: "fields",
});

const CATEGORY_COLUMN = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  id: PRODUCTS.CATEGORY,
  table_id: PRODUCTS_ID,
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Category",
  field_ref: ["field", PRODUCTS.CATEGORY, null],
  source: "fields",
});

const VENDOR_COLUMN = createMockColumn({
  name: "VENDOR",
  display_name: "Vendor",
  id: PRODUCTS.VENDOR,
  table_id: PRODUCTS_ID,
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Company",
  field_ref: ["field", PRODUCTS.VENDOR, null],
  source: "fields",
});

const COLUMNS: DatasetColumn[] = [
  ID_COLUMN,
  TITLE_COLUMN,
  CATEGORY_COLUMN,
  VENDOR_COLUMN,
];

const ROWS = [
  [1, "Rustic Paper Wallet", "Gizmo", "Swaniawski, Casper and Hilll"],
  [2, "Small Marble Shoes", "Doohickey", "Balistreri-Ankunding"],
  [3, "Ergonomic Silk Coat", "Doohickey", "Upton, Kovacek and Halvorson"],
];

const PRODUCTS_MODEL = createMockCard({
  id: MODEL_ID,
  name: "Products Model",
  type: "model",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
    }),
  ),
  result_metadata: toResultMetadata(COLUMNS),
});

const PRODUCTS_MODEL_DATASET = createMockDataset({
  data: { rows: ROWS, cols: COLUMNS },
  row_count: ROWS.length,
});

const isCardGet = (url: string, method?: string) =>
  method?.toUpperCase() === "GET" &&
  new URL(url).pathname === `/api/card/${MODEL_ID}`;

const getCardGetCalls = () =>
  fetchMock.callHistory
    .calls()
    .filter((call) => isCardGet(call.url, call.options.method));

describe("QueryBuilder > model indexes", () => {
  mockGetBoundingClientRect();

  describe("object detail of an indexed record", () => {
    it("opens another record of the same model without reloading the model", async () => {
      setupActionsEndpoints([]);
      const { router } = await setup({
        card: PRODUCTS_MODEL,
        dataset: PRODUCTS_MODEL_DATASET,
        initialRoute: "/",
      });

      // a command palette result for an indexed record links to /model/:slug/:pk
      act(() => {
        router.navigate(`/model/${MODEL_SLUG}/2`);
      });

      const firstDetail = await screen.findByTestId("object-detail");
      expect(
        await within(firstDetail).findByRole("heading", {
          name: "Small Marble Shoes",
        }),
      ).toBeInTheDocument();
      expect(
        within(firstDetail).getAllByText("Small Marble Shoes"),
      ).toHaveLength(2);
      expect(within(firstDetail).getByText("Doohickey")).toBeInTheDocument();
      expect(getCardGetCalls()).toHaveLength(1);

      act(() => {
        router.navigate(`/model/${MODEL_SLUG}/3`);
      });

      const secondDetail = await screen.findByTestId("object-detail");
      expect(
        await within(secondDetail).findByRole("heading", {
          name: "Ergonomic Silk Coat",
        }),
      ).toBeInTheDocument();
      expect(
        within(secondDetail).getByText("Upton, Kovacek and Halvorson"),
      ).toBeInTheDocument();
      expect(getCardGetCalls()).toHaveLength(1);
    });
  });

  describe("indexing a column in the metadata editor", () => {
    it("creates, deletes and re-creates the index of the second column", async () => {
      setupStatefulModelIndexEndpoints({
        modelId: MODEL_ID,
        nextIndexId: CREATED_INDEX_ID,
      });
      const { store } = await setupModelPage();

      await editTitleMetadata(store);
      expect(getIndexToggle()).not.toBeChecked();
      await userEvent.click(getIndexToggle());
      await saveChanges();

      await waitFor(() => expect(getCreateIndexBodies()).toHaveLength(1));
      expect(getCreateIndexBodies()[0]).toEqual({
        model_id: MODEL_ID,
        pk_ref: ID_COLUMN.field_ref,
        value_ref: TITLE_COLUMN.field_ref,
      });

      await editTitleMetadata(store);
      expect(await findIndexToggle()).toBeChecked();
      await userEvent.click(getIndexToggle());
      await saveChanges();

      await waitFor(() => expect(getDeleteIndexUrls()).toHaveLength(1));
      expect(getDeleteIndexUrls()).toEqual([
        `/api/model-index/${CREATED_INDEX_ID}`,
      ]);

      await editTitleMetadata(store);
      expect(getIndexToggle()).not.toBeChecked();
      await userEvent.click(getIndexToggle());
      await saveChanges();

      // the deleted index must not linger in the cached model index list (metabase#31094)
      await waitFor(() => expect(getCreateIndexBodies()).toHaveLength(2));
      expect(getCreateIndexBodies()[1]).toEqual({
        model_id: MODEL_ID,
        pk_ref: ID_COLUMN.field_ref,
        value_ref: TITLE_COLUMN.field_ref,
      });
      await waitForQueryToFinish(store);
    });

    it("does not create an index when the primary key is unassigned in the same save", async () => {
      setupStatefulModelIndexEndpoints({
        modelId: MODEL_ID,
        nextIndexId: CREATED_INDEX_ID,
      });
      const { store } = await setupModelPage();

      await editTitleMetadata(store);
      await userEvent.click(getIndexToggle());
      expect(getIndexToggle()).toBeChecked();

      await selectColumn("ID");
      await userEvent.click(await screen.findByDisplayValue("Entity Key"));
      await userEvent.click(
        await screen.findByRole("option", { name: /Foreign Key/ }),
      );
      await saveChanges();

      await waitFor(() => expect(getCardUpdateBodies()).toHaveLength(1));
      expect(getCardUpdateBodies()[0]).toMatchObject({
        result_metadata: expect.arrayContaining([
          expect.objectContaining({ name: "ID", semantic_type: "type/FK" }),
        ]),
      });
      expect(
        await screen.findByRole("gridcell", { name: "Rustic Paper Wallet" }),
      ).toBeInTheDocument();
      expect(getCreateIndexBodies()).toHaveLength(0);
      await waitForQueryToFinish(store);
    });
  });
});

type Store = { getState: () => State };

async function setupModelPage() {
  setupActionsEndpoints([]);
  return setup({
    card: PRODUCTS_MODEL,
    dataset: PRODUCTS_MODEL_DATASET,
    initialRoute: `/model/${MODEL_SLUG}`,
  });
}

async function selectColumn(name: string) {
  // the header's accessible name starts with the column type icon label
  const header = await screen.findByRole("columnheader", {
    name: new RegExp(` ${name}$`),
  });
  await userEvent.click(within(header).getByText(name));
}

async function editTitleMetadata(store: Store) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Move, trash, and more…" }),
  );
  const queryRunsBefore = countQueryRuns();
  await userEvent.click(await screen.findByText("Edit metadata"));
  // The editor reruns the query as it opens and focuses the first column when
  // the result arrives, which would undo a column chosen before that.
  await waitFor(() => expect(countQueryRuns()).toBe(queryRunsBefore + 1));
  await waitForQueryToFinish(store);
  // Responses that land later re-render the grid and can swallow the click.
  await act(() => fetchMock.callHistory.flush(true));
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveValue("ID"),
  );
  await selectColumn("Title");
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveValue("Title"),
  );
}

function getIndexToggle() {
  return screen.getByLabelText(/Surface individual records/);
}

function findIndexToggle() {
  return screen.findByLabelText(/Surface individual records/);
}

async function saveChanges() {
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  // the editor closes once the model indexes have been updated
  await waitFor(() =>
    expect(screen.queryByTestId("dataset-edit-bar")).not.toBeInTheDocument(),
  );
}

function getRequestBodies(routeName: string): unknown[] {
  return fetchMock.callHistory
    .calls(routeName)
    .map((call) => JSON.parse(String(call.options.body)));
}

function getCreateIndexBodies() {
  return getRequestBodies("stateful-model-index-create");
}

function getCardUpdateBodies() {
  return getRequestBodies(`card-${MODEL_ID}-put`);
}

function getDeleteIndexUrls() {
  return fetchMock.callHistory
    .calls("stateful-model-index-delete")
    .map((call) => new URL(call.url).pathname);
}

const QUERY_RUN_PATH = /^\/api\/(card\/\d+\/query|dataset)$/;

function countQueryRuns() {
  return fetchMock.callHistory
    .calls()
    .filter((call) => QUERY_RUN_PATH.test(new URL(call.url).pathname)).length;
}
