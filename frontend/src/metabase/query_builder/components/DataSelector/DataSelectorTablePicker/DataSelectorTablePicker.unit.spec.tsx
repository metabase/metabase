import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { InitialSyncStatus, Schema, Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import DataSelectorTablePicker from "./DataSelectorTablePicker";

const TEST_TABLE = createMockTable();
const TEST_DATABASE = createMockDatabase({ tables: [TEST_TABLE] });
const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

interface SetupOpts {
  schemas?: Schema[];
  tables?: Table[];
}

const setup = ({ schemas = [], tables = [] }: SetupOpts = {}) => {
  const TEST_DATABASE = createMockDatabase({ tables: tables });
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [TEST_DATABASE],
    }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(TEST_DATABASE.id));
  const metadataSchemas = schemas.map(schema =>
    checkNotNull(metadata.schema(schema.id)),
  );
  const metadataTables = tables.map(table =>
    checkNotNull(metadata.table(table.id)),
  );

  renderWithProviders(
    <DataSelectorTablePicker
      selectedDatabase={database}
      schemas={metadataSchemas}
      tables={metadataTables}
      onChangeTable={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

describe("DataSelectorTablePicker", () => {
  it.each(NOT_SYNCED_DB_STATUSES)(
    "render a loading spinner when a table has initial_sync_status='incomplete'",
    initial_sync_status => {
      setup({ tables: [createMockTable({ initial_sync_status })] });
      expect(
        within(screen.getByRole("option")).getByTestId("loading-spinner"),
      ).toBeInTheDocument();
    },
  );

  it("don't render a loading spinner when a table has initial_sync_status='complete'", () => {
    setup({ tables: [createMockTable({ initial_sync_status: "complete" })] });
    // eslint-disable-next-line testing-library/prefer-presence-queries
    expect(
      within(screen.getByRole("option")).queryByTestId("loading-spinner"),
    ).not.toBeInTheDocument();
  });

  it("when no table is in database", () => {
    setup();

    expect(
      screen.getByText("No tables found in this database."),
    ).toBeInTheDocument();

    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });

  it("when tables are passed", () => {
    setup({
      tables: [TEST_TABLE],
    });

    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.display_name)).toBeInTheDocument();
  });
});
