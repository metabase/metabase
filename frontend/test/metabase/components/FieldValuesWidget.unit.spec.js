import React from "react";
import { render, screen } from "@testing-library/react";

import { ORDERS, PRODUCTS, PEOPLE } from "__support__/sample_dataset_fixture";
import { FieldValuesWidget } from "metabase/components/FieldValuesWidget";

const mock = (object, properties) =>
  Object.assign(Object.create(object), properties);

const renderFieldValuesWidget = props =>
  render(
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
        fields: [mock(PRODUCTS.CATEGORY, { has_field_values: "none" })],
      };

      it("should not call fetchFieldValues", () => {
        const fetchFieldValues = jest.fn();
        renderFieldValuesWidget({ ...props, fetchFieldValues });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Enter some text' as the placeholder text", () => {
        renderFieldValuesWidget({ ...props });
        screen.findByLabelText("Enter some text");
      });
    });
    describe("has_field_values = list", () => {
      const props = {
        fields: [PRODUCTS.CATEGORY],
      };

      it("should call fetchFieldValues", () => {
        const fetchFieldValues = jest.fn();
        renderFieldValuesWidget({ ...props, fetchFieldValues });
        expect(fetchFieldValues).toHaveBeenCalledWith(PRODUCTS.CATEGORY.id);
      });

      it("should have 'Search the list' as the placeholder text", () => {
        renderFieldValuesWidget({ ...props });
        screen.findByLabelText("Search the list");
      });
    });

    describe("has_field_values = search", () => {
      const props = {
        fields: [mock(PRODUCTS.CATEGORY, { has_field_values: "search" })],
      };

      it("should not call fetchFieldValues", () => {
        const fetchFieldValues = jest.fn();
        renderFieldValuesWidget({ ...props, fetchFieldValues });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Search by Category' as the placeholder text", () => {
        renderFieldValuesWidget({ ...props });
        screen.findByLabelText("Search the list");
      });
    });
  });

  describe("id field", () => {
    describe("has_field_values = none", () => {
      it("should have 'Enter an ID' as the placeholder text", () => {
        renderFieldValuesWidget({
          fields: [mock(ORDERS.PRODUCT_ID, { has_field_values: "none" })],
        });
        screen.findByLabelText("Enter an ID");
      });
    });

    describe("has_field_values = list", () => {
      it("should have 'Search the list' as the placeholder text", () => {
        renderFieldValuesWidget({
          fields: [
            mock(ORDERS.PRODUCT_ID, {
              has_field_values: "list",
              values: [[1234]],
            }),
          ],
        });
        screen.findByLabelText("Search the list");
      });
    });

    describe("has_field_values = search", () => {
      it("should have 'Search by Category or enter an ID' as the placeholder text", () => {
        renderFieldValuesWidget({
          fields: [
            mock(ORDERS.PRODUCT_ID, {
              has_field_values: "search",
              remappedField: () => PRODUCTS.CATEGORY,
            }),
          ],
        });
        screen.findByLabelText("Search by Category or enter an ID");
      });

      it("should not duplicate 'ID' in placeholder when ID itself is searchable", () => {
        const fields = [
          mock(ORDERS.PRODUCT_ID, {
            base_type: "type/Text",
            has_field_values: "search",
          }),
        ];
        renderFieldValuesWidget({ fields });
        screen.findByLabelText("Search by Product");
      });
    });
  });

  describe("multiple fields", () => {
    it("list multiple fields together", () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "list" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      screen.findByLabelText("Search the list");

      screen.getByText("AZ");
      screen.getByText("Facebook");
    });

    it("search if any field is a search", () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "search" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      screen.findByLabelText("Search");

      expect(screen.queryByText("AZ")).toBeNull();
      expect(screen.queryByText("Facebook")).toBeNull();
    });

    it("don't list any values if any is set to 'plain input box'", () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "none" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      screen.findByLabelText("Enter some text");

      expect(screen.queryByText("AZ")).toBeNull();
      expect(screen.queryByText("Facebook")).toBeNull();
    });
  });
});
