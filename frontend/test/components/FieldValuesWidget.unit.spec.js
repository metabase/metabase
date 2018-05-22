import React from "react";
import { mount } from "enzyme";

import {
  metadata,
  PRODUCT_CATEGORY_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
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
  describe("category field", () => {
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
        expect(fetchFieldValues).toHaveBeenCalledWith(
          PRODUCT_CATEGORY_FIELD_ID,
        );
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
        searchField: metadata.field(PRODUCT_CATEGORY_FIELD_ID),
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
  describe("id field", () => {
    describe("has_field_values = none", () => {
      it("should have 'Enter an ID' as the placeholder text", () => {
        const component = mountFieldValuesWidget({
          field: mock(metadata.field(ORDERS_PRODUCT_FK_FIELD_ID), {
            has_field_values: "none",
          }),
        });
        expect(component.find(TokenField).props().placeholder).toEqual(
          "Enter an ID",
        );
      });
    });
    describe("has_field_values = list", () => {
      it("should have 'Search the list' as the placeholder text", () => {
        const component = mountFieldValuesWidget({
          field: mock(metadata.field(ORDERS_PRODUCT_FK_FIELD_ID), {
            has_field_values: "list",
            values: [[1234]],
          }),
        });
        expect(component.find(TokenField).props().placeholder).toEqual(
          "Search the list",
        );
      });
    });
    describe("has_field_values = search", () => {
      it("should have 'Search by Category or enter an ID' as the placeholder text", () => {
        const component = mountFieldValuesWidget({
          field: mock(metadata.field(ORDERS_PRODUCT_FK_FIELD_ID), {
            has_field_values: "search",
          }),
          searchField: metadata.field(PRODUCT_CATEGORY_FIELD_ID),
        });
        expect(component.find(TokenField).props().placeholder).toEqual(
          "Search by Category or enter an ID",
        );
      });
      it("should not duplicate 'ID' in placeholder when ID itself is searchable", () => {
        const field = mock(metadata.field(ORDERS_PRODUCT_FK_FIELD_ID), {
          base_type: "type/Text",
          has_field_values: "search",
        });
        const component = mountFieldValuesWidget({
          field: field,
          searchField: field,
        });
        expect(component.find(TokenField).props().placeholder).toEqual(
          "Search by Product",
        );
      });
    });
  });
});
