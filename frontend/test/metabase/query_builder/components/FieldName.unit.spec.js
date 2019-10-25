import React from "react";
import { mount } from "enzyme";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import FieldName from "metabase/query_builder/components/FieldName";

describe("FieldName", () => {
  it("should render regular field correctly", () => {
    const fieldName = mount(
      <FieldName field={ORDERS.CREATED_AT.id} tableMetadata={ORDERS} />,
    );
    expect(fieldName.text()).toEqual("Created At");
  });
  it("should render local field correctly", () => {
    const fieldName = mount(
      <FieldName
        field={["field-id", ORDERS.CREATED_AT.id]}
        tableMetadata={ORDERS}
      />,
    );
    expect(fieldName.text()).toEqual("Created At");
  });
  it("should render foreign key correctly", () => {
    const fieldName = mount(
      <FieldName
        field={["fk->", ORDERS.PRODUCT_ID.id, PRODUCTS.CATEGORY.id]}
        tableMetadata={ORDERS}
      />,
    );
    expect(fieldName.text()).toEqual("Product → Category");
  });
  it("should render datetime correctly", () => {
    const fieldName = mount(
      <FieldName
        field={["datetime-field", ORDERS.CREATED_AT.id, "week"]}
        tableMetadata={ORDERS}
      />,
    );
    expect(fieldName.text()).toEqual("Created At: Week");
  });
  // TODO: How to test nested fields with the test dataset? Should we create a test mongo dataset?
  it("should render nested field correctly", () => {
    pending();
    const fieldName = mount(<FieldName field={2} tableMetadata={ORDERS.id} />);
    expect(fieldName.text()).toEqual("Foo: Baz");
  });
  // TODO: How to test nested fields with the test dataset? Should we create a test mongo dataset?
  it("should render nested fk field correctly", () => {
    pending();
    const fieldName = mount(
      <FieldName
        field={["fk->", ["field-id", 3], ["field-id", 2]]}
        tableMetadata={ORDERS.id}
      />,
    );
    expect(fieldName.text()).toEqual("BarFoo: Baz");
  });
});
