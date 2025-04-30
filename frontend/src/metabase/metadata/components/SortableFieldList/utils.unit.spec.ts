import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { getItems } from "./utils";

describe("getItems", () => {
  it("orders table", () => {
    const table = createOrdersTable();

    expect(getItems(table)).toMatchObject([
      { icon: "label", label: "ID" },
      { icon: "connections", label: "User ID" },
      { icon: "connections", label: "Product ID" },
      { icon: "int", label: "Subtotal" },
      { icon: "int", label: "Tax" },
      { icon: "int", label: "Total" },
      { icon: "int", label: "Discount" },
      { icon: "calendar", label: "Created At" },
      { icon: "int", label: "Quantity" },
    ]);
  });

  it("products table", () => {
    const table = createProductsTable();

    expect(getItems(table)).toMatchObject([
      { icon: "label", label: "ID" },
      { icon: "string", label: "Ean" },
      { icon: "string", label: "Title" },
      { icon: "string", label: "Category" },
      { icon: "string", label: "Vendor" },
      { icon: "int", label: "Price" },
      { icon: "int", label: "Rating" },
      { icon: "calendar", label: "Created At" },
    ]);
  });

  it("people table", () => {
    const table = createPeopleTable();

    expect(getItems(table)).toMatchObject([
      { icon: "label", label: "ID" },
      { icon: "string", label: "Address" },
      { icon: "string", label: "Email" },
      { icon: "string", label: "Password" },
      { icon: "string", label: "Name" },
      { icon: "location", label: "City" },
      { icon: "location", label: "Longitude" },
      { icon: "location", label: "State" },
      { icon: "string", label: "Source" },
      { icon: "calendar", label: "Birth Date" },
      { icon: "location", label: "Zip" },
      { icon: "location", label: "Latitude" },
      { icon: "calendar", label: "Created At" },
    ]);
  });

  it("reviews table", () => {
    const table = createReviewsTable();

    expect(getItems(table)).toMatchObject([
      { icon: "label", label: "ID" },
      { icon: "connections", label: "Product ID" },
      { icon: "string", label: "Reviewer" },
      { icon: "int", label: "Rating" },
      { icon: "string", label: "Body" },
      { icon: "calendar", label: "Created At" },
    ]);
  });
});
