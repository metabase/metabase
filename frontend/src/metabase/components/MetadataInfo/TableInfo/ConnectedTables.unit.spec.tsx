import React from "react";
import { render, screen } from "@testing-library/react";
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
  ORDERS,
  PRODUCTS,
  PEOPLE_ID,
  PRODUCTS_ID,
  REVIEWS,
} from "metabase-types/api/mocks/presets";
import type Table from "metabase-lib/metadata/Table";
import ConnectedTables from "./ConnectedTables";

const ordersTable = createOrdersTable();
const productsTable = createProductsTable();
const reviewsTable = createReviewsTable();

const productsProductId = checkNotNull(
  productsTable.fields?.find(field => field.id === PRODUCTS.ID),
);
const ordersProductId = checkNotNull(
  ordersTable.fields?.find(field => field.id === ORDERS.PRODUCT_ID),
);
const reviewsProductId = checkNotNull(
  reviewsTable.fields?.find(field => field.id === REVIEWS.PRODUCT_ID),
);

productsTable.fks = [
  createMockForeignKey({
    origin: createMockForeignKeyField({
      ...ordersProductId,
      table: ordersTable,
    }),
    destination: createMockForeignKeyField({
      ...productsProductId,
      table: productsTable,
    }),
  }),
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
      tables: [ordersTable, productsTable, reviewsTable, createPeopleTable()],
    }),
  ],
});

function setup(table: Table) {
  return render(<ConnectedTables table={table} />);
}

describe("ConnectedTables", () => {
  it("should show nothing when the table has no fks", () => {
    const table = checkNotNull(metadata.table(PEOPLE_ID));
    const { container } = setup(table);
    expect(container).toBeEmptyDOMElement();
  });

  it("should show a label for each connected table", () => {
    const table = checkNotNull(metadata.table(PRODUCTS_ID));
    setup(table);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
  });
});
