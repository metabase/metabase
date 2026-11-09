import userEvent from "@testing-library/user-event";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import type { Database, SearchModel, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DataSourceSelector } from "../DataSelector";

const DATABASES = [createSampleDatabase()];

const WAREHOUSE_DB_ID = 100;
const WAREHOUSE_PAYMENTS_TABLE_ID = 1000;
const WAREHOUSE_INVOICES_TABLE_ID = 1001;

const WAREHOUSE_DATABASE = createMockDatabase({
  id: WAREHOUSE_DB_ID,
  name: "Warehouse",
  tables: [
    createMockTable({
      id: WAREHOUSE_PAYMENTS_TABLE_ID,
      db_id: WAREHOUSE_DB_ID,
      schema: "Accounting",
      display_name: "Payments",
    }),
    createMockTable({
      id: WAREHOUSE_INVOICES_TABLE_ID,
      db_id: WAREHOUSE_DB_ID,
      schema: "Finance",
      display_name: "Invoices",
    }),
  ],
});

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
  setupSearchEndpoints(
    AVAILABLE_MODELS[availableModels].map((model) =>
      createMockSearchResult({ model }),
    ),
  );

  setupDatabasesEndpoints(databases);

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
      setSourceFn={jest.fn()}
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
          // Unjustified type cast. FIXME
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

    it("drills down from Raw Data to the databases, Warehouse's schemas and Finance's tables, then back up one step at a time to the data types", async () => {
      setup({
        ...setupOpts,
        databases: [createSampleDatabase(), WAREHOUSE_DATABASE],
      });

      await userEvent.click(await screen.findByText("Raw Data"));
      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
      expect(screen.getByText("Warehouse")).toBeInTheDocument();
      expect(screen.queryByText("Accounting")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Warehouse"));
      expect(await screen.findByText("Accounting")).toBeInTheDocument();
      expect(screen.getByText("Finance")).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Finance"));
      expect(await screen.findByText("Invoices")).toBeInTheDocument();
      expect(screen.queryByText("Accounting")).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("source-database"));
      expect(await screen.findByText("Accounting")).toBeInTheDocument();
      expect(screen.getByText("Finance")).toBeInTheDocument();
      expect(screen.queryByText("Invoices")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Warehouse"));
      const sampleDatabase = await screen.findByText("Sample Database");
      const rawData = screen.getByText("Raw Data");
      const warehouse = screen.getByText("Warehouse");
      expect(
        rawData.compareDocumentPosition(sampleDatabase) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        sampleDatabase.compareDocumentPosition(warehouse) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByText("Accounting")).not.toBeInTheDocument();

      await userEvent.click(rawData);
      expect(await screen.findByText("Models")).toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
    });

    it("does not show a search box on the schema step of a database with 2 schemas", async () => {
      setup({
        ...setupOpts,
        databases: [createSampleDatabase(), WAREHOUSE_DATABASE],
      });

      await userEvent.click(await screen.findByText("Raw Data"));
      await userEvent.click(await screen.findByText("Warehouse"));

      expect(await screen.findByText("Accounting")).toBeInTheDocument();
      expect(screen.getByText("Finance")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Find...")).not.toBeInTheDocument();
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

    it("should return to the bucket step when closing the saved entity picker via its back button", async () => {
      setup(setupOpts);

      await userEvent.click(await screen.findByText("Saved Questions"));
      expect(await screen.findByText("Our analytics")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("saved-entity-back-navigation"));

      expect(await screen.findByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
      expect(
        screen.queryByTestId("saved-entity-back-navigation"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders data bucket step with every bucket at once (metabase#74428)", async () => {
    setup({ availableModels: "with-models" });

    expect(await screen.findByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Raw Data")).toBeInTheDocument();
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
