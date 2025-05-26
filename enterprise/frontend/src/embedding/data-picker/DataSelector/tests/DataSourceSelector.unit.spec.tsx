import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import type { Database, Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DataSourceSelector } from "../DataSelector";

const DATABASES = [createSampleDatabase()];

const storeInitialState = createMockState({
  settings: createMockSettingsState({
    "enable-nested-queries": true,
  }),
});

const AVAILABLE_MODELS: Record<AvailableModels, ("dataset" | "table")[]> = {
  "tables-only": ["table"],
  "tables-and-models": ["dataset", "table"],
};

type AvailableModels = "tables-only" | "tables-and-models";

interface SetupOpts {
  databases?: Database[];
  isJoinStep?: boolean;
  availableModels?: AvailableModels;
  selectedTable?: {
    id: number;
    databaseId: number;
  };
}

function setup({
  databases = DATABASES,
  isJoinStep = false,
  availableModels = "tables-only",
  selectedTable,
}: SetupOpts = {}) {
  fetchMock.get(
    {
      url: "path:/api/search",
      query: {
        calculate_available_models: true,
        limit: 0,
        models: ["dataset"],
      },
    },
    {
      data: [],
      limit: 0,
      models: ["dataset"],
      offset: 0,
      table_db_id: null,
      engine: "search.engine/in-place",
      total: 1,
      available_models: AVAILABLE_MODELS[availableModels],
    },
  );

  setupDatabasesEndpoints(databases, undefined, { saved: true });

  return renderWithProviders(
    <DataSourceSelector
      isInitiallyOpen
      isQuerySourceModel={false}
      canChangeDatabase={!isJoinStep}
      selectedDatabaseId={selectedTable ? selectedTable.databaseId : null}
      selectedTableId={selectedTable ? selectedTable.id : undefined}
      canSelectModel={true}
      canSelectTable={true}
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
      availableModels: "tables-and-models",
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
