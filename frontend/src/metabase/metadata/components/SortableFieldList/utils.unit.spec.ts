import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createOrdersUserIdField,
  createPeopleBirthDateField,
  createPeopleIdField,
  createPeopleLatitudeField,
  createPeopleLongitudeField,
  createPeopleStateField,
  createPeopleTable,
  createProductsRatingField,
  createProductsTable,
  createProductsVendorField,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { getFieldIcon, getItems } from "./utils";

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

describe("getFieldIcon", () => {
  const tableId = 999;

  it.each([
    {
      field: createPeopleIdField({
        display_name: "primary key",
        table_id: tableId,
      }),
      expectedIcon: "label",
    },
    {
      field: createOrdersUserIdField({
        display_name: "foreign key",
        table_id: tableId,
      }),
      expectedIcon: "connections",
    },
    {
      field: createPeopleStateField({
        display_name: "location",
        table_id: tableId,
      }),
      expectedIcon: "location",
    },
    {
      field: createPeopleLatitudeField({
        display_name: "latitude",
        table_id: tableId,
      }),
      expectedIcon: "location",
    },
    {
      field: createPeopleLongitudeField({
        display_name: "longitude",
        table_id: tableId,
      }),
      expectedIcon: "location",
    },
    {
      field: createPeopleBirthDateField({
        display_name: "temporal",
        table_id: tableId,
      }),
      expectedIcon: "calendar",
    },
    {
      field: createMockField({
        display_name: "boolean",
        table_id: tableId,
        base_type: "type/Boolean",
        effective_type: "type/Boolean",
      }),
      expectedIcon: "io",
    },
    {
      field: createProductsVendorField({
        display_name: "string",
        table_id: tableId,
      }),
      expectedIcon: "string",
    },
    {
      field: createProductsRatingField({
        display_name: "numeric",
        table_id: tableId,
      }),
      expectedIcon: "int",
    },
    {
      field: createMockField({
        display_name: "unknown",
        table_id: tableId,
        base_type: "type/*",
        effective_type: "type/*",
      }),
      expectedIcon: "list",
    },
  ])(
    "should return correct icon for $field.display_name column",
    ({ expectedIcon, field }) => {
      const table = createMockTable({ id: tableId, fields: [field] });

      expect(getFieldIcon(table, field)).toBe(expectedIcon);
    },
  );
});
