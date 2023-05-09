import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import Table from "metabase-lib/metadata/Table";
import { TableInfo } from "./TableInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

const productsTable = new Table({
  ...metadata.table(PRODUCTS_ID),
  fields: [1, 2, 3],
  fks: [
    {
      origin: {
        table: {
          id: 111,
          db_id: 222,
          display_name: "Connected Table",
        },
      },
    },
  ],
});
const tableWithoutDescription = new Table({
  id: 123,
  display_name: "Foo",
  fields: [],
});

const fetchForeignKeys = jest.fn();
const fetchMetadata = jest.fn();

function setup({ id, table }: { table: Table | undefined; id: Table["id"] }) {
  fetchForeignKeys.mockReset();
  fetchMetadata.mockReset();

  return render(
    <TableInfo
      tableId={id}
      table={table}
      fetchForeignKeys={fetchForeignKeys}
      fetchMetadata={fetchMetadata}
    />,
  );
}

describe("TableInfo", () => {
  it("should fetch table metadata if fields are missing", () => {
    setup({
      id: PRODUCTS_ID,
      table: new Table({
        ...metadata.table(PRODUCTS_ID),
        fields: undefined,
        fks: [],
      }),
    });
    expect(fetchMetadata).toHaveBeenCalledWith({
      id: PRODUCTS_ID,
    });
    expect(fetchForeignKeys).not.toHaveBeenCalled();
  });

  it("should fetch table metadata if the table is undefined", () => {
    setup({ id: 123, table: undefined });

    expect(fetchMetadata).toHaveBeenCalledWith({
      id: 123,
    });
    expect(fetchForeignKeys).toHaveBeenCalledWith({
      id: 123,
    });
  });

  it("should fetch fks if fks are undefined on table", () => {
    setup({
      id: PRODUCTS_ID,
      table: new Table({
        ...metadata.table(PRODUCTS_ID),
        fields: [1, 2, 3],
        fks: undefined,
      }),
    });

    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchForeignKeys).toHaveBeenCalledWith({
      id: PRODUCTS_ID,
    });
  });

  it("should not send requests fetching table metadata when metadata is already present", () => {
    setup({
      id: PRODUCTS_ID,
      table: productsTable,
    });

    expect(fetchForeignKeys).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("should display a placeholder if table has no description", async () => {
    setup({
      id: tableWithoutDescription.id,
      table: tableWithoutDescription,
    });

    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  describe("after metadata has been fetched", () => {
    it("should display the given table's description", () => {
      setup({ id: PRODUCTS_ID, table: productsTable });
      expect(
        screen.getByText(metadata.table(PRODUCTS_ID)?.description as string),
      ).toBeInTheDocument();
    });

    it("should show a count of columns on the table", () => {
      setup({ id: PRODUCTS_ID, table: productsTable });
      expect(screen.getByText("3 columns")).toBeInTheDocument();
    });

    it("should list connected tables", () => {
      setup({ id: PRODUCTS_ID, table: productsTable });
      expect(screen.getByText("Connected Table")).toBeInTheDocument();
    });
  });
});
