import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { render, renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { DataSelectorDatabaseSchemaPicker } from "./DataSelectorDatabaseSchemaPicker";

const DEFAULT_PROPS = {
  hasBackButton: false,
  hasFiltering: false,
  hasInitialFocus: false,
  hasNextStep: false,
  isLoading: false,
  onChangeDatabase: jest.fn(),
  onChangeSchema: jest.fn(),
};

const hydrateDatabase = (database: Database) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });
  return checkNotNull(getMetadata(state).database(database.id));
};

const setup = (opts: { database: Database }) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(opts.database.id));
  const schemas = database.getSchemas();

  renderWithProviders(
    <DataSelectorDatabaseSchemaPicker
      {...DEFAULT_PROPS}
      selectedDatabase={database}
      selectedSchema={schemas[0]}
      databases={[database]}
      onChangeSchema={jest.fn()}
      onChangeDatabase={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

describe("DataSelectorDatabaseSchemaPicker", () => {
  it("displays loading message when it has no databases", () => {
    render(
      <DataSelectorDatabaseSchemaPicker {...DEFAULT_PROPS} databases={[]} />,
    );

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  describe("displays picker when it has databases", () => {
    it("includes database name if it's not about saved questions", () => {
      const databaseName = "Database name";
      const schemaName = "Schema name";

      const database = hydrateDatabase(
        createMockDatabase({
          name: databaseName,
          tables: [
            createMockTable({ id: 1, db_id: 1, schema: schemaName }),
            createMockTable({ id: 2, db_id: 1, schema: "another schema name" }),
          ],
        }),
      );

      render(
        <DataSelectorDatabaseSchemaPicker
          {...DEFAULT_PROPS}
          databases={[database]}
        />,
      );

      expect(screen.getByText(databaseName)).toBeInTheDocument();
      expect(
        screen.getByText(checkNotNull(getSchemaDisplayName(schemaName))),
      ).toBeInTheDocument();
    });

    it("displays Saved Questions if it's about saved questions", () => {
      const databaseName = "Database name";
      const schemaName = "Schema name";

      const database = hydrateDatabase(
        createMockDatabase({
          name: databaseName,
          is_saved_questions: true,
          tables: [
            createMockTable({ id: 1, db_id: 1, schema: schemaName }),
            createMockTable({ id: 2, db_id: 1, schema: "another schema name" }),
          ],
        }),
      );

      render(
        <DataSelectorDatabaseSchemaPicker
          {...DEFAULT_PROPS}
          databases={[database]}
        />,
      );

      expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
      expect(
        screen.queryByText(checkNotNull(getSchemaDisplayName(schemaName))),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });
  });

  it("doesn't display a loading spinner next to a schema when the database has initial_sync_status='incomplete'", () => {
    const database = createMockDatabase({
      initial_sync_status: "incomplete",
      tables: [
        createMockTable({ id: 1, db_id: 1, schema: "Schema 1" }),
        createMockTable({ id: 2, db_id: 1, schema: "Schema 2" }),
      ],
    });
    setup({ database });
    // There should only be one loading-indicator next to the database name, and not the schema names
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.getByText("Schema 1")).toBeInTheDocument();
    expect(screen.getByText("Schema 2")).toBeInTheDocument();
  });
});
