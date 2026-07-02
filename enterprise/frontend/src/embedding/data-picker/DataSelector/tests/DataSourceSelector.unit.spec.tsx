import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { Database, SearchModel, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DataSourceSelector } from "../DataSelector";

const DATABASES = [createSampleDatabase()];

const storeInitialState = createMockState({
  settings: createMockSettingsState({
    "enable-nested-queries": true,
  }),
});

const AVAILABLE_MODELS: Record<
  AvailableModels,
  Extract<SearchModel, "table" | "dataset" | "card">[]
> = {
  "tables-only": ["table"],
  "with-models": ["table", "dataset"],
  "with-questions": ["table", "card"],
};

type AvailableModels = "tables-only" | "with-models" | "with-questions";

interface SetupOpts {
  databases?: Database[];
  isJoinStep?: boolean;
  availableModels?: AvailableModels;
  selectedTable?: {
    id: number;
    databaseId: number;
  };
  entityTypes?: EmbeddingEntityType[];
}

function setup({
  databases = DATABASES,
  isJoinStep = false,
  availableModels = "tables-only",
  selectedTable,
  entityTypes,
}: SetupOpts = {}) {
  fetchMock.get({
    url: "path:/api/search",
    query: {
      calculate_available_models: true,
      limit: 0,
      models: ["dataset"],
    },
    response: {
      data: [],
      limit: 0,
      models: ["dataset"],
      offset: 0,
      table_db_id: null,
      engine: "search.engine/in-place",
      total: 1,
      available_models: AVAILABLE_MODELS[availableModels],
    },
  });

  setupDatabasesEndpoints(
    databases,
    { hasSavedQuestions: availableModels === "with-questions" },
    { saved: true },
  );

  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [],
  });

  return renderWithProviders(
    <DataSourceSelector
      isInitiallyOpen
      querySourceType={undefined}
      canChangeDatabase={!isJoinStep}
      selectedDatabaseId={selectedTable ? selectedTable.databaseId : null}
      selectedTableId={selectedTable ? selectedTable.id : undefined}
      canSelectModel={entityTypes ? entityTypes.includes("model") : true}
      canSelectTable={entityTypes ? entityTypes.includes("table") : true}
      canSelectQuestion={entityTypes ? entityTypes.includes("question") : true}
      triggerElement={<div>Click me to open or close data picker</div>}
      setSourceTableFn={jest.fn()}
    />,
    { storeInitialState },
  );
}

describe("DataSourceSelector", () => {
  it("should close the picker when clicking outside", async () => {
    setup({
      availableModels: "tables-only",
    });

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();

    await userEvent.click(
      screen.getByText("Click me to open or close data picker"),
    );

    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
  });

  describe("only tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: "tables-only",
    };

    it("should show search input when there are 10 and more tables", async () => {
      const sampleDatabase = createSampleDatabase();
      const DB_ID = getNextId(sampleDatabase.id);
      setup({
        ...setupOpts,
        databases: [
          sampleDatabase,
          createMockDatabase({
            id: DB_ID,
            name: "Many tables Database",
            tables: [...createNNumberOfTables(10, DB_ID)],
          }),
        ],
      });
      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(screen.getByText("Many tables Database")).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Many tables Database"));
      expect(await screen.findByText("Table 1")).toBeInTheDocument();
      expect(screen.getByText("Table 2")).toBeInTheDocument();
      expect(screen.getByText("Table 3")).toBeInTheDocument();
      expect(screen.getByText("Table 4")).toBeInTheDocument();
      expect(screen.getByText("Table 5")).toBeInTheDocument();
      expect(screen.getByText("Table 6")).toBeInTheDocument();
      expect(screen.getByText("Table 7")).toBeInTheDocument();
      expect(screen.getByText("Table 8")).toBeInTheDocument();
      expect(screen.getByText("Table 9")).toBeInTheDocument();
      expect(screen.getByText("Table 10")).toBeInTheDocument();

      const searchBox = screen.getByPlaceholderText("Find...");
      expect(searchBox).toBeInTheDocument();

      // Assert that the search query is used.
      await userEvent.type(searchBox, "Table 1");
      expect(await screen.findByText("Table 1")).toBeInTheDocument();
      expect(screen.queryByText("Table 2")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 3")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 4")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 5")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 6")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 7")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 8")).not.toBeInTheDocument();
      expect(screen.queryByText("Table 9")).not.toBeInTheDocument();
      expect(screen.getByText("Table 10")).toBeInTheDocument();
    });

    it("should not show search input when there less than 10 tables", async () => {
      setup(setupOpts);
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("Sample Database")).toBeInTheDocument();

      expect(screen.queryByPlaceholderText("Find...")).not.toBeInTheDocument();
    });
  });

  describe("both models and tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: "with-models",
    };

    it("should only show data from the selected database when joining data", async () => {
      const sampleDatabase = createSampleDatabase();
      const DB_ID = getNextId(sampleDatabase.id);
      const manyTablesDatabase = createMockDatabase({
        id: DB_ID,
        name: "Many tables Database",
        tables: [...createNNumberOfTables(10, DB_ID)],
      });

      setup({
        ...setupOpts,
        isJoinStep: true,
        databases: [sampleDatabase, manyTablesDatabase],
        selectedTable: {
          id: (manyTablesDatabase.tables as Table[])[0].id as number,
          databaseId: manyTablesDatabase.id,
        },
      });

      expect(
        await screen.findByText("Many tables Database"),
      ).toBeInTheDocument();
      expect(screen.getByText("Table 1")).toBeInTheDocument();
      await userEvent.click(screen.getByText("Many tables Database"));
      // We're at the database step
      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Many tables Database")).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
    });

    it("should skip the bucket step and show the SavedEntityPicker right away if there is only models in the bucket step", async () => {
      setup({
        ...setupOpts,
        entityTypes: ["model"],
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Models")).toBeInTheDocument();
    });
  });

  describe("both questions and tables are available", () => {
    const setupOpts: SetupOpts = {
      availableModels: "with-questions",
    };

    it("should skip the bucket step and show the SavedEntityPicker right away if there is only questions in the bucket step", async () => {
      setup({
        ...setupOpts,
        entityTypes: ["question"],
      });

      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });
  });

  // metabase#74428: after the "Remove database entity" PR the picker hydrated as
  // soon as the (fast) models search resolved, so it showed the models bucket
  // before the database list had loaded and streamed the databases in
  // afterwards. The picker must wait for both before rendering its first step.
  describe("when the database list resolves after the models search (metabase#74428)", () => {
    function setupWithDeferredDatabaseList() {
      let resolveSearch!: () => void;
      const searchResponse = new Promise<void>((resolve) => {
        resolveSearch = resolve;
      });
      fetchMock.get({
        url: "path:/api/search",
        query: {
          calculate_available_models: true,
          limit: 0,
          models: ["dataset"],
        },
        response: () =>
          searchResponse.then(() => ({
            data: [],
            limit: 0,
            models: ["dataset"],
            offset: 0,
            table_db_id: null,
            total: 1,
            available_models: ["table", "dataset"],
          })),
        name: "deferred-search",
      });

      let resolveDatabaseList!: () => void;
      const databaseListResponse = new Promise<void>((resolve) => {
        resolveDatabaseList = resolve;
      });
      fetchMock.get({
        url: "path:/api/database",
        query: { saved: true },
        response: () =>
          databaseListResponse.then(() => ({
            data: DATABASES,
            total: DATABASES.length,
          })),
        name: "deferred-database-list",
      });

      renderWithProviders(
        <DataSourceSelector
          isInitiallyOpen
          querySourceType={undefined}
          canChangeDatabase
          selectedDatabaseId={null}
          canSelectModel
          canSelectTable
          canSelectQuestion
          triggerElement={<div>Click me to open or close data picker</div>}
          setSourceTableFn={jest.fn()}
        />,
        {
          storeInitialState: createMockState({
            // `databases` is empty while the list request is in flight, so we
            // need data-access permissions to render the picker (rather than the
            // "add some data first" empty state) during that window.
            currentUser: createMockUser({
              permissions: createMockUserPermissions({
                can_create_queries: true,
              }),
            }),
            settings: createMockSettingsState({
              "enable-nested-queries": true,
            }),
          }),
        },
      );

      return { resolveSearch, resolveDatabaseList };
    }

    it("does not render the data bucket step until the databases have loaded", async () => {
      const { resolveSearch, resolveDatabaseList } =
        setupWithDeferredDatabaseList();

      // Both requests are in flight, so the picker shows its loading state.
      expect(
        await screen.findByTestId("loading-indicator"),
      ).toBeInTheDocument();

      // The models search resolves first; the database list is still pending.
      resolveSearch();
      await waitFor(() => {
        expect(
          screen.queryByTestId("loading-indicator"),
        ).not.toBeInTheDocument();
      });

      // Regression: the bucket step must NOT appear yet. Before the fix, "Models"
      // showed here, ahead of the still-loading databases.
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();

      // Once the databases load, the bucket step appears with everything at once.
      resolveDatabaseList();
      expect(await screen.findByText("Models")).toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
    });
  });
});

function createNNumberOfTables(numberOfTables: number, dbId: number): Table[] {
  // To avoid having the same ID as the sample database tables
  const STARTING_TABLE_ID = 100;
  return Array.from({ length: numberOfTables }, (_, index) =>
    createMockTable({
      id: getNextId(index === 0 ? STARTING_TABLE_ID : undefined),
      db_id: dbId,
      display_name: `Table ${index + 1}`,
    }),
  );
}
