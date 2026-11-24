import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupListSourceReplacementRunsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCheckReplaceSourceInfo,
  createMockCollection,
  createMockDatabase,
  createMockReplaceSourceColumnInfo,
  createMockSearchResult,
  createMockTable,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { PanelHeader } from "./PanelHeader";

const DATABASE = createMockDatabase({ id: 2, name: "Writable Postgres12" });
const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});
const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "Bobby Tables's Personal Collection",
  is_personal: true,
  personal_owner_id: 1,
});

const SOURCE_TABLE = createMockTable({
  id: 10,
  db_id: DATABASE.id,
  db: DATABASE,
  schema: "public",
  name: "source_table",
  display_name: "Source Table",
});
const COMPATIBLE_TARGET = createMockTable({
  id: 11,
  db_id: DATABASE.id,
  db: DATABASE,
  schema: "public",
  name: "compatible_target",
  display_name: "Compatible Target",
});

const SOURCE_NODE = createMockTableDependencyNode({
  id: Number(SOURCE_TABLE.id),
  data: createMockTableDependencyNodeData({
    name: SOURCE_TABLE.name,
    display_name: SOURCE_TABLE.display_name,
    db_id: DATABASE.id,
  }),
});

const DEPENDENT = createMockCardDependencyNode({
  id: 30,
  data: createMockCardDependencyNodeData({
    name: "Graph question",
    type: "question",
  }),
});

const ID_COLUMN = createMockReplaceSourceColumnInfo({
  name: "id",
  display_name: "ID",
  base_type: "type/Integer",
  effective_type: "type/Integer",
});

function setup() {
  setupListSourceReplacementRunsEndpoint([]);
  setupDatabasesEndpoints([DATABASE]);
  setupCollectionsEndpoints({
    collections: [ROOT_COLLECTION, PERSONAL_COLLECTION],
  });
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupTableEndpoints(SOURCE_TABLE);
  setupTableEndpoints(COMPATIBLE_TARGET);
  setupSearchEndpoints([
    createMockSearchResult({
      id: COMPATIBLE_TARGET.id,
      model: "table",
      name: COMPATIBLE_TARGET.display_name,
      table_id: Number(COMPATIBLE_TARGET.id),
      table_schema: "public",
      database_id: DATABASE.id,
      database_name: DATABASE.name,
      collection: ROOT_COLLECTION,
    }),
  ]);

  fetchMock.get("path:/api/ee/dependencies/graph/dependents", (call) => {
    const params = new URL(call.url).searchParams;
    const isSource =
      params.get("id") === String(SOURCE_TABLE.id) &&
      params.get("type") === "table";
    return isSource ? [DEPENDENT] : [];
  });

  fetchMock.post(
    "path:/api/ee/replacement/check-replace-source",
    async (call) => {
      const body = JSON.parse(String(call.options.body));
      const isMatch =
        body.source_entity_id === SOURCE_TABLE.id &&
        body.source_entity_type === "table" &&
        body.target_entity_id === COMPATIBLE_TARGET.id &&
        body.target_entity_type === "table";
      if (!isMatch) {
        return { status: 404 };
      }
      return createMockCheckReplaceSourceInfo({
        success: true,
        column_mappings: [{ source: ID_COLUMN, target: ID_COLUMN }],
      });
    },
  );

  fetchMock.post("path:/api/ee/replacement/replace-source", { run_id: 1 });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    }),
  });
  setupEnterprisePlugins();
  mockGetBoundingClientRect();

  renderWithProviders(
    <Route
      path="/"
      element={<PanelHeader node={SOURCE_NODE} onClose={jest.fn()} />}
    />,
    { storeInitialState: state, withRouter: true },
  );
}

describe("PanelHeader", () => {
  it("replaces the data source of the graph node", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Replace data source" }),
    );
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Find and replace a data source"),
    ).toBeInTheDocument();
    // the modal opens with the graph node as the source
    expect(await within(modal).findByText("Source Table")).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByRole("button", {
        name: /Pick a table, model, or saved question/,
      }),
    );
    const picker = await screen.findByTestId("entity-picker-modal");
    await userEvent.type(
      await within(picker).findByPlaceholderText("Search…"),
      "Compatible Target",
    );
    const result = await within(picker).findByTestId("result-item");
    await userEvent.click(within(result).getByText("Compatible Target"));

    await userEvent.click(
      await within(modal).findByRole("button", {
        name: "Replace data source in 1 items",
      }),
    );
    const confirmation = await screen.findByRole("dialog", {
      name: "Really replace the data source in this 1 item?",
    });
    await userEvent.click(
      within(confirmation).getByRole("button", {
        name: "Replace data source in 1 item",
      }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/replacement/replace-source"),
      ).toHaveLength(1);
    });
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/replacement/replace-source",
    );
    expect(JSON.parse(String(call?.options.body))).toEqual({
      source_entity_id: SOURCE_TABLE.id,
      source_entity_type: "table",
      target_entity_id: COMPATIBLE_TARGET.id,
      target_entity_type: "table",
    });
    await waitFor(() => {
      expect(
        screen.queryByText("Find and replace a data source"),
      ).not.toBeInTheDocument();
    });
  });
});
