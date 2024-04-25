import { render } from "@testing-library/react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockDatabase, createMockSchema } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import DataSelectorDatabaseSchemaPicker from "./DataSelectorDatabaseSchemaPicker";

const setup = opts => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(opts.database.id));
  const schemas = database.getSchemas();

  renderWithProviders(
    <DataSelectorDatabaseSchemaPicker
      selectedDatabase={database}
      selectedSchema={schemas[0]}
      databases={[database]}
      schemas={schemas}
      onChangeSchema={jest.fn()}
      onChangeDatabase={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

describe("DataSelectorDatabaseSchemaPicker", () => {
  it("displays loading message when it has no databases", () => {
    render(<DataSelectorDatabaseSchemaPicker databases={[]} />);

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
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
            {
              displayName: () => schemaName,
            },
            {
              displayName: () => "another schema name",
            },
          ],
        },
      ];

      render(<DataSelectorDatabaseSchemaPicker databases={databases} />);

      expect(screen.getByText(databaseName)).toBeInTheDocument();
      expect(screen.getByText(schemaName)).toBeInTheDocument();
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
            {
              displayName: () => schemaName,
            },
            {
              displayName: () => "another schema name",
            },
          ],
        },
      ];

      render(<DataSelectorDatabaseSchemaPicker databases={databases} />);

      expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
      expect(screen.queryByText(schemaName)).not.toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });
  });

  it("doesn't display a loading spinner next to a schema when the database has initial_sync_status='incomplete'", () => {
    const database = createMockDatabase({
      initial_sync_status: "incomplete",
      schemas: [
        createMockSchema({ id: 1, name: "Schema 1" }),
        createMockSchema({ id: 2, name: "Schema 2" }),
      ],
    });
    setup({ database });
    // There should only be one loading-spinner next to the database name, and not the schema names
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.getByText("Schema 1")).toBeInTheDocument();
    expect(screen.getByText("Schema 2")).toBeInTheDocument();
  });
});
