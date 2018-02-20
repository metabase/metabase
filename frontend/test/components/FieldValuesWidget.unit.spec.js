import React from "react";
import { mount } from "enzyme";

import {
  metadata,
  PRODUCT_CATEGORY_FIELD_ID,
} from "../__support__/sample_dataset_fixture";

import { FieldValuesWidget } from "../../src/metabase/components/FieldValuesWidget";
import TokenField from "../../src/metabase/components/TokenField";

const mock = (object, properties) =>
  Object.assign(Object.create(object), properties);

const mountFieldValuesWidget = props =>
  mount(
    <FieldValuesWidget
      value={[]}
      onChange={() => {}}
      fetchFieldValues={() => {}}
      {...props}
    />,
  );

describe("FieldValuesWidget", () => {
  describe("has_field_values = none", () => {
    const props = {
      field: mock(metadata.field(PRODUCT_CATEGORY_FIELD_ID), {
        has_field_values: "none",
      }),
    };
    it("should not call fetchFieldValues", () => {
      const fetchFieldValues = jest.fn();
      mountFieldValuesWidget({ ...props, fetchFieldValues });
      expect(fetchFieldValues).not.toHaveBeenCalled();
    });
    it("should have 'Enter some text' as the placeholder text", () => {
      const component = mountFieldValuesWidget({ ...props });
      expect(component.find(TokenField).props().placeholder).toEqual(
        "Enter some text",
      );
    });
  });
  describe("has_field_values = list", () => {
    const props = {
      field: metadata.field(PRODUCT_CATEGORY_FIELD_ID),
    };
    it("should call fetchFieldValues", () => {
      const fetchFieldValues = jest.fn();
      mountFieldValuesWidget({ ...props, fetchFieldValues });
      expect(fetchFieldValues).toHaveBeenCalledWith(PRODUCT_CATEGORY_FIELD_ID);
    });
    it("should have 'Search the list' as the placeholder text", () => {
      const component = mountFieldValuesWidget({ ...props });
      expect(component.find(TokenField).props().placeholder).toEqual(
        "Search the list",
      );
    });
  });
  describe("has_field_values = search", () => {
    const props = {
      field: mock(metadata.field(PRODUCT_CATEGORY_FIELD_ID), {
        has_field_values: "search",
      }),
      searchField: metadata
        .field(PRODUCT_CATEGORY_FIELD_ID)
        .filterSearchField(),
    };
    it("should not call fetchFieldValues", () => {
      const fetchFieldValues = jest.fn();
      mountFieldValuesWidget({ ...props, fetchFieldValues });
      expect(fetchFieldValues).not.toHaveBeenCalled();
    });
    it("should have 'Search by Category' as the placeholder text", () => {
      const component = mountFieldValuesWidget({ ...props });
      expect(component.find(TokenField).props().placeholder).toEqual(
        "Search by Category",
      );
    });
  });
});
