import { createMockEntitiesState } from "__support__/store";
import { render, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import type Database from "metabase-lib/v1/metadata/Database";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { Database as ApiDatabase } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { DataSelectorDatabaseSchemaPicker } from "./DataSelectorDatabaseSchemaPicker";

const defaultProps = {
  hasBackButton: false,
  hasFiltering: false,
  hasInitialFocus: false,
  hasNextStep: false,
  isLoading: false,
  onChangeDatabase: jest.fn(),
  onChangeSchema: jest.fn(),
};

const setup = (opts: { database: ApiDatabase }) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(opts.database.id));
  const schemas = database.getSchemas();

  renderWithProviders(
    <DataSelectorDatabaseSchemaPicker
      {...defaultProps}
      selectedDatabase={database}
      selectedSchema={schemas[0]}
      databases={[database]}
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

      const databases = [
        {
          id: 1,
          name: databaseName,
          getSchemas: () => [
            { name: schemaName },
            { name: "another schema name" },
          ],
        },
      ] as unknown as Database[];

      render(
        <DataSelectorDatabaseSchemaPicker
          {...defaultProps}
          databases={databases}
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

      const databases = [
        {
          id: 1,
          is_saved_questions: true,
          name: databaseName,
          getSchemas: () => [
            { name: schemaName },
            { name: "another schema name" },
          ],
        },
      ] as unknown as Database[];

      render(
        <DataSelectorDatabaseSchemaPicker
          {...defaultProps}
          databases={databases}
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
