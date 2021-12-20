import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS } from "__support__/sample_dataset_fixture";
import Table from "metabase-lib/lib/metadata/Table";

import { TableInfo } from "./TableInfo";

const productsTableWithoutMetadata = new Table({
  ...PRODUCTS,
  fields: undefined,
  fks: undefined,
});

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

function setup(table: Table) {
  fetchForeignKeys.mockReset();
  fetchMetadata.mockReset();

  return render(
    <TableInfo
      tableId={table.id}
      table={table}
      fetchForeignKeys={fetchForeignKeys}
      fetchMetadata={fetchMetadata}
    />,
  );
}

describe("TableInfo", () => {
  it("should send requests fetching table metadata", () => {
    setup(productsTableWithoutMetadata);

    expect(fetchForeignKeys).toHaveBeenCalledWith({
      id: PRODUCTS.id,
    });
    expect(fetchMetadata).toHaveBeenCalledWith({
      id: PRODUCTS.id,
    });
  });

  it("should not send requests fetching table metadata when metadata is already present", () => {
    setup(productsTable);

    expect(fetchForeignKeys).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("should display a placeholder if table has no description", async () => {
    setup(tableWithoutDescription);

    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  describe("after metadata has been fetched", () => {
    beforeEach(() => {
      setup(productsTable);
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
