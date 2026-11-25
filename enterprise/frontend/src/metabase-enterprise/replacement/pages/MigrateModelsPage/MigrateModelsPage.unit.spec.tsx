import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupListSourceReplacementRunsEndpoint,
  setupListTransformTagsEndpoint,
  setupReplaceModelWithTransformEndpoint,
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
import type { Card, Database } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { MigrateModelsPage } from "./MigrateModelsPage";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const SAMPLE_DATABASE = createMockDatabase({
  id: 1,
  name: "Sample Database",
  is_sample: true,
  features: ["transforms/table", "schemas"],
});
const WRITABLE_DATABASE = createMockDatabase({
  id: 2,
  name: "Writable Postgres12",
  features: ["transforms/table", "schemas"],
  tables: [createMockTable({ id: 20, db_id: 2, schema: "public" })],
});

const SAMPLE_DB_MODEL = createMockCard({
  id: 101,
  name: "Sample DB model",
  type: "model",
  database_id: SAMPLE_DATABASE.id,
  collection: ROOT_COLLECTION,
});
const TARGET_MODEL = createMockCard({
  id: 102,
  name: "Target model",
  type: "model",
  database_id: WRITABLE_DATABASE.id,
  collection: ROOT_COLLECTION,
});

function createModelSearchResult(card: Card, database: Database) {
  return createMockSearchResult({
    id: card.id,
    model: "dataset",
    name: card.name,
    database_id: database.id,
    collection: ROOT_COLLECTION,
  });
}

function setup() {
  fetchMock.get("path:/api/search", (call) => {
    const params = new URL(call.url).searchParams;
    const isModelMigrationSearch =
      params.get("context") === "model-migration" &&
      params.getAll("models").includes("dataset");
    const data = isModelMigrationSearch
      ? [
          createModelSearchResult(SAMPLE_DB_MODEL, SAMPLE_DATABASE),
          createModelSearchResult(TARGET_MODEL, WRITABLE_DATABASE),
        ]
      : [];
    return { data, total: data.length, models: ["dataset"] };
  });
  setupCardEndpoints(SAMPLE_DB_MODEL);
  setupCardEndpoints(TARGET_MODEL);
  setupDatabaseEndpoints(SAMPLE_DATABASE);
  setupDatabaseEndpoints(WRITABLE_DATABASE);
  setupCollectionByIdEndpoint({ collections: [ROOT_COLLECTION] });
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", []);
  setupListSourceReplacementRunsEndpoint([]);
  setupListTransformTagsEndpoint([]);
  setupReplaceModelWithTransformEndpoint();

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    }),
  });
  setupEnterprisePlugins();
  mockGetBoundingClientRect();

  renderWithProviders(<Route path="/" element={<MigrateModelsPage />} />, {
    storeInitialState: state,
    withRouter: true,
  });
}

async function selectModel(name: string) {
  await userEvent.click(
    await screen.findByRole("row", { name: new RegExp(name) }),
  );
  // the sidebar of the previous model stays until the new card loads
  await waitFor(() => {
    expect(
      within(screen.getByTestId("model-sidebar-header")).getByText(name),
    ).toBeInTheDocument();
  });
  return screen.getByTestId("model-sidebar");
}

describe("MigrateModelsPage", () => {
  it("disables the conversion of a model in the Sample Database", async () => {
    setup();

    expect(
      await screen.findByText("Pick a model to convert"),
    ).toBeInTheDocument();

    const sampleSidebar = await selectModel("Sample DB model");
    expect(
      await within(sampleSidebar).findByRole("button", {
        name: /Convert to a transform/,
      }),
    ).toBeDisabled();

    // positive control: a model in a database with transforms
    const targetSidebar = await selectModel("Target model");
    await waitFor(() => {
      expect(
        within(targetSidebar).getByRole("button", {
          name: /Convert to a transform/,
        }),
      ).toBeEnabled();
    });
  });

  it("converts a model to a transform with the table name the user typed", async () => {
    setup();

    const sidebar = await selectModel("Target model");
    await userEvent.click(
      await within(sidebar).findByRole("button", {
        name: /Convert to a transform/,
      }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "Convert this model to a transform?",
    });

    const tableNameInput = await within(modal).findByLabelText("Table name");
    expect(tableNameInput).toHaveValue("target_model");

    await userEvent.clear(tableNameInput);
    await userEvent.type(tableNameInput, "mtt_output_table");
    await userEvent.click(
      within(modal).getByRole("button", { name: /Convert to a transform/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(
          "path:/api/ee/replacement/replace-model-with-transform",
        ),
      ).toHaveLength(1);
    });
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/replacement/replace-model-with-transform",
    );
    expect(JSON.parse(String(call?.options.body))).toEqual({
      card_id: TARGET_MODEL.id,
      transform_name: TARGET_MODEL.name,
      transform_target: {
        type: "table",
        name: "mtt_output_table",
        schema: "public",
        database: WRITABLE_DATABASE.id,
      },
      target_collection_id: null,
      transform_tag_ids: [],
    });
  });
});
