import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS } from "__support__/sample_database_fixture";
import Table from "metabase-lib/lib/metadata/Table";

import { TableInfo } from "./TableInfo";

const productsTable = new Table({
  ...PRODUCTS,
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

function setup({ id, table }: { table: Table | undefined; id: number }) {
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
      id: PRODUCTS.id,
      table: new Table({ ...PRODUCTS, fields: undefined, fks: [] }),
    });
    expect(fetchMetadata).toHaveBeenCalledWith({
      id: PRODUCTS.id,
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
      id: PRODUCTS.id,
      table: new Table({ ...PRODUCTS, fields: [1, 2, 3], fks: undefined }),
    });

    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchForeignKeys).toHaveBeenCalledWith({
      id: PRODUCTS.id,
    });
  });

  it("should not send requests fetching table metadata when metadata is already present", () => {
    setup({
      id: PRODUCTS.id,
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
    beforeEach(() => {
      setup({
        id: PRODUCTS.id,
        table: productsTable,
      });
    });

    it("should display the given table's description", () => {
      expect(screen.getByText(PRODUCTS.description)).toBeInTheDocument();
    });

    it("should show a count of columns on the table", () => {
      expect(screen.getByText("3 columns")).toBeInTheDocument();
    });

    it("should list connected tables", () => {
      expect(screen.getByText("Connected Table")).toBeInTheDocument();
    });
  });
});
