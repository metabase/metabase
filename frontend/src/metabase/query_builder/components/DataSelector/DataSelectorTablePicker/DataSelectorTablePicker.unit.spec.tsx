import React from "react";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { SchemaId, TableId } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import DataSelectorTablePicker from "./DataSelectorTablePicker";

const TEST_TABLE = createMockTable();
const TEST_DATABASE = createMockDatabase({ tables: [TEST_TABLE] });

interface SetupOpts {
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
}

const setup = ({ schemaIds = [], tableIds = [] }: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [TEST_DATABASE],
    }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(TEST_DATABASE.id));
  const schemas = schemaIds.map(id => checkNotNull(metadata.schema(id)));
  const tables = tableIds.map(id => checkNotNull(metadata.table(id)));

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
  it("when no table is in database", () => {
    setup();

    expect(
      screen.getByText("No tables found in this database."),
    ).toBeInTheDocument();

    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });

  it("when tables are passed", () => {
    setup({
      tableIds: [TEST_TABLE.id],
    });

    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.display_name)).toBeInTheDocument();
  });
});
