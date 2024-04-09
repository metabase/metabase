import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { InitialSyncStatus, Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import DataSelectorTablePicker from "./DataSelectorTablePicker";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

interface SetupOpts {
  database: Database;
}

const setup = (opts: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(opts.database.id));
  const schemas = database.getSchemas();
  const tables = database.getTables();

  renderWithProviders(
    <DataSelectorTablePicker
      selectedDatabase={database}
      schemas={schemas}
      tables={tables}
      onChangeTable={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

describe("DataSelectorTablePicker", () => {
  it.each(NOT_SYNCED_DB_STATUSES)(
    "render a loading spinner when a table has initial_sync_status='%s'",
    initial_sync_status => {
      const database = createMockDatabase({
        tables: [createMockTable({ initial_sync_status })],
      });
      setup({ database });
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    },
  );

  it("don't render a loading spinner when a table has initial_sync_status='complete'", () => {
    const database = createMockDatabase({
      tables: [createMockTable({ initial_sync_status: "complete" })],
    });
    setup({ database });
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  it("when no table is in database", () => {
    const database = createMockDatabase({ tables: [] });
    setup({ database });
    expect(
      screen.getByText("No tables found in this database."),
    ).toBeInTheDocument();
    expect(screen.getByText(database.name)).toBeInTheDocument();
  });

  it("show tables in the database", () => {
    const table = createMockTable({ description: "This a table description" });
    const database = createMockDatabase({ tables: [table] });
    setup({ database });
    expect(screen.getByText(database.name)).toBeInTheDocument();
    expect(screen.getByText(table.display_name)).toBeInTheDocument();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });
});
