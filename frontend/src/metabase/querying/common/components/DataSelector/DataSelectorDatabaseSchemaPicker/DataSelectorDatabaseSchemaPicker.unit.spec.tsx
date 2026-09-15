import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { render, renderWithProviders, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { Database as ApiDatabase } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import type { DataSelectorDatabase, DataSelectorSchema } from "../types";

import { DataSelectorDatabaseSchemaPicker } from "./DataSelectorDatabaseSchemaPicker";

const defaultProps = {
  hasBackButton: false,
  hasFiltering: false,
  hasInitialFocus: false,
  hasNextStep: false,
  isLoading: false,
  onChangeDatabase: jest.fn(),
  onChangeSchema: jest.fn(),
  getDatabaseSchemas: () => [],
};

const setup = (opts: { database: ApiDatabase }) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const lookups = getEntityLookups(state);
  const database = checkNotNull(lookups.database(opts.database.id));
  const schemas = lookups.databaseSchemas(database.id);

  renderWithProviders(
    <DataSelectorDatabaseSchemaPicker
      {...defaultProps}
      selectedDatabase={database}
      selectedSchema={schemas[0]}
      databases={[database]}
      getDatabaseSchemas={lookups.databaseSchemas}
    />,
    { storeInitialState: state },
  );
};

describe("DataSelectorDatabaseSchemaPicker", () => {
  it("displays loading message when it has no databases", () => {
    render(
      <DataSelectorDatabaseSchemaPicker {...defaultProps} databases={[]} />,
    );

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  describe("displays picker when it has databases", () => {
    it("includes database name if it's not about saved questions", () => {
      const databaseName = "Database name";
      const schemaName = "Schema name";

      // The picker only reads database id and name, so a partial mock is
      // enough here.
      const databases = [
        { id: 1, name: databaseName },
      ] as DataSelectorDatabase[];

      render(
        <DataSelectorDatabaseSchemaPicker
          {...defaultProps}
          databases={databases}
          getDatabaseSchemas={() =>
            // The picker only reads schema names here.
            [
              { name: schemaName },
              { name: "another schema name" },
            ] as DataSelectorSchema[]
          }
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

      // The picker only reads database id, name and is_saved_questions, so a
      // partial mock is enough here.
      const databases = [
        { id: 1, is_saved_questions: true, name: databaseName },
      ] as DataSelectorDatabase[];

      render(
        <DataSelectorDatabaseSchemaPicker
          {...defaultProps}
          databases={databases}
          getDatabaseSchemas={() =>
            // The picker only reads schema names here.
            [
              { name: schemaName },
              { name: "another schema name" },
            ] as DataSelectorSchema[]
          }
        />,
      );

      expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
      expect(screen.queryByText(schemaName)).not.toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });
  });

  it("doesn't display a loading spinner next to a schema when the database has initial_sync_status='incomplete'", () => {
    const database = createMockDatabase({
      initial_sync_status: "incomplete",
      tables: [
        createMockTable({ id: 1, schema: "Schema 1" }),
        createMockTable({ id: 2, schema: "Schema 2" }),
      ],
    });
    setup({ database });
    // There should only be one loading-indicator next to the database name, and not the schema names
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.getByText("Schema 1")).toBeInTheDocument();
    expect(screen.getByText("Schema 2")).toBeInTheDocument();
  });
});
