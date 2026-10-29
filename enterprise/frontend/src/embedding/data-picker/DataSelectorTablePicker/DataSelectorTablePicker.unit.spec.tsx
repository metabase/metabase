import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import type { Database, InitialSyncStatus } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { DataSelectorTablePicker } from "./DataSelectorTablePicker";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

interface SetupOpts {
  database: Database;
}

const setup = (opts: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [opts.database] }),
  });
  const lookups = getEntityLookups(state);
  const database = checkNotNull(lookups.database(opts.database.id));
  const schemas = lookups.databaseSchemas(database.id);
  const tables = lookups.databaseTables(database.id);

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
    (initial_sync_status) => {
      const database = createMockDatabase({
        tables: [createMockTable({ initial_sync_status })],
      });
      setup({ database });
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    },
  );

  it("don't render a loading spinner when a table has initial_sync_status='complete'", () => {
    const database = createMockDatabase({
      tables: [createMockTable({ initial_sync_status: "complete" })],
    });
    setup({ database });
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
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
    const table = createMockTable();
    const database = createMockDatabase({ tables: [table] });
    setup({ database });
    expect(screen.getByText(database.name)).toBeInTheDocument();
    expect(screen.getByText(table.display_name)).toBeInTheDocument();
  });

  it("shows a plain table icon and no info icon on every row, with or without a description", () => {
    const describedTable = createMockTable({
      id: 1,
      display_name: "Orders",
      description:
        "Confirmed Sample Company orders for a product, from a user.",
    });
    const undescribedTable = createMockTable({
      id: 2,
      display_name: "People",
    });
    const database = createMockDatabase({
      tables: [describedTable, undescribedTable],
    });
    setup({ database });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getAllByLabelText("table icon")).toHaveLength(2);
    expect(screen.queryByLabelText("More info")).not.toBeInTheDocument();
  });
});
