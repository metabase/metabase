import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import {
  createMockForeignKey,
  createMockForeignKeyField,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  ORDERS_ID,
  REVIEWS,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";
import type Table from "metabase-lib/metadata/Table";
import { TableInfo } from "./TableInfo";

const ordersTable = createOrdersTable({ fks: undefined });
const peopleTable = createPeopleTable({ fields: undefined, fks: [] });
const productsTable = createProductsTable();
const reviewsTable = createReviewsTable({ description: null });

const productsProductId = checkNotNull(
  productsTable.fields?.find(field => field.id === PRODUCTS.ID),
);
const reviewsProductId = checkNotNull(
  reviewsTable.fields?.find(field => field.id === REVIEWS.PRODUCT_ID),
);

productsTable.fks = [
  createMockForeignKey({
    origin: createMockForeignKeyField({
      ...reviewsProductId,
      table: reviewsTable,
    }),
    destination: createMockForeignKeyField({
      ...productsProductId,
      table: productsTable,
    }),
  }),
];

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [ordersTable, peopleTable, productsTable, reviewsTable],
    }),
  ],
});

function setup({ id, table }: { table: Table | undefined; id: Table["id"] }) {
  const fetchForeignKeys = jest.fn();
  const fetchMetadata = jest.fn();

  render(
    <TableInfo
      tableId={id}
      table={table}
      fetchForeignKeys={fetchForeignKeys}
      fetchMetadata={fetchMetadata}
    />,
  );

  return { fetchForeignKeys, fetchMetadata };
}

describe("TableInfo", () => {
  it("should fetch table metadata if fields are missing", async () => {
    const table = checkNotNull(metadata.table(PEOPLE_ID));
    const { fetchForeignKeys, fetchMetadata } = setup({
      id: table.id,
      table: table,
    });

    await waitFor(() =>
      expect(fetchMetadata).toHaveBeenCalledWith({ id: table.id }),
    );
    expect(fetchForeignKeys).not.toHaveBeenCalled();
  });

  it("should fetch table metadata if the table is undefined", async () => {
    const { fetchForeignKeys, fetchMetadata } = setup({
      id: 123,
      table: undefined,
    });

    await waitFor(() =>
      expect(fetchMetadata).toHaveBeenCalledWith({ id: 123 }),
    );
    expect(fetchForeignKeys).toHaveBeenCalledWith({ id: 123 });
  });

  it("should fetch fks if fks are undefined on table", async () => {
    const table = checkNotNull(metadata.table(ORDERS_ID));
    const { fetchForeignKeys, fetchMetadata } = setup({
      id: table.id,
      table: table,
    });

    await waitFor(() =>
      expect(fetchForeignKeys).toHaveBeenCalledWith({ id: table.id }),
    );
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("should not send requests fetching table metadata when metadata is already present", () => {
    const table = checkNotNull(metadata.table(PRODUCTS_ID));
    const { fetchForeignKeys, fetchMetadata } = setup({
      id: table.id,
      table,
    });

    expect(fetchForeignKeys).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("should display a placeholder if table has no description", async () => {
    const table = checkNotNull(metadata.table(REVIEWS_ID));
    setup({ id: table.id, table });
    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  describe("after metadata has been fetched", () => {
    const table = checkNotNull(metadata.table(PRODUCTS_ID));

    it("should display the given table's description", () => {
      setup({ id: table.id, table });
      expect(screen.getByText(table.description as string)).toBeInTheDocument();
    });

    it("should show a count of columns on the table", () => {
      setup({ id: table.id, table });
      expect(
        screen.getByText(`${table.fields.length} columns`),
      ).toBeInTheDocument();
    });

    it("should list connected tables", () => {
      setup({ id: table.id, table });
      expect(screen.getByText("Reviews")).toBeInTheDocument();
    });
  });
});
