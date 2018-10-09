import React from "react";
import { mount } from "enzyme";

import {
  metadata, // connected graph,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_CATEGORY_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import FieldName from "metabase/query_builder/components/FieldName.jsx";

describe("FieldName", () => {
  it("should render regular field correctly", () => {
    let fieldName = mount(
      <FieldName
        field={ORDERS_CREATED_DATE_FIELD_ID}
        tableMetadata={metadata.tables[ORDERS_TABLE_ID]}
      />,
    );
    expect(fieldName.text()).toEqual("Created At");
  });
  it("should render local field correctly", () => {
    let fieldName = mount(
      <FieldName
        field={["field-id", ORDERS_CREATED_DATE_FIELD_ID]}
        tableMetadata={metadata.tables[ORDERS_TABLE_ID]}
      />,
    );
    expect(fieldName.text()).toEqual("Created At");
  });
  it("should render foreign key correctly", () => {
    let fieldName = mount(
      <FieldName
        field={["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CATEGORY_FIELD_ID]}
        tableMetadata={metadata.tables[ORDERS_TABLE_ID]}
      />,
    );
    expect(fieldName.text()).toEqual("ProductCategory");
  });
  it("should render datetime correctly", () => {
    let fieldName = mount(
      <FieldName
        field={["datetime-field", ORDERS_CREATED_DATE_FIELD_ID, "week"]}
        tableMetadata={metadata.tables[ORDERS_TABLE_ID]}
      />,
    );
    expect(fieldName.text()).toEqual("Created At: Week");
  });
  // TODO: How to test nested fields with the test dataset? Should we create a test mongo dataset?
  it("should render nested field correctly", () => {
    pending();
    let fieldName = mount(
      <FieldName field={2} tableMetadata={ORDERS_TABLE_ID} />,
    );
    expect(fieldName.text()).toEqual("Foo: Baz");
  });
  // TODO: How to test nested fields with the test dataset? Should we create a test mongo dataset?
  it("should render nested fk field correctly", () => {
    pending();
    let fieldName = mount(
      <FieldName field={["fk->", 3, 2]} tableMetadata={ORDERS_TABLE_ID} />,
    );
    expect(fieldName.text()).toEqual("BarFoo: Baz");
  });
});
