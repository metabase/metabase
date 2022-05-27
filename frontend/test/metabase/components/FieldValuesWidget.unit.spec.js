import React from "react";
import { render, screen } from "@testing-library/react";
import "mutationobserver-shim";

import { ORDERS, PRODUCTS, PEOPLE } from "__support__/sample_database_fixture";
import { FieldValuesWidget } from "metabase/components/FieldValuesWidget";

const mock = (object, properties) =>
  Object.assign(Object.create(object), properties);

const renderFieldValuesWidget = props =>
  render(
    <FieldValuesWidget
      value={[]}
      onChange={() => {}}
      fetchFieldValues={() => {}}
      addRemappings={() => {}}
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

      it("should have 'Enter some text' as the placeholder text", async () => {
        renderFieldValuesWidget({ ...props });
        await screen.findByPlaceholderText("Enter some text");
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

      // current version of this component always shows the search box
      it.skip("should not have 'Search the list' as the placeholder text for fields with less or equal than 10 values", async () => {
        renderFieldValuesWidget({ ...props });
        expect(
          await screen.queryByPlaceholderText("Search the list"),
        ).toBeNull();
      });

      it("should have 'Enter some text' as the placeholder text for fields with more than 10 values", async () => {
        renderFieldValuesWidget({
          fields: [mock(PRODUCTS.TITLE, { has_field_values: "list" })],
        });
        await screen.findByPlaceholderText("Enter some text");
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

      it("should have 'Search by Category' as the placeholder text", async () => {
        renderFieldValuesWidget({ ...props });
        await screen.findByPlaceholderText("Search by Category");
      });
    });
  });

  describe("id field", () => {
    describe("has_field_values = none", () => {
      it("should have 'Enter an ID' as the placeholder text", async () => {
        renderFieldValuesWidget({
          fields: [mock(ORDERS.PRODUCT_ID, { has_field_values: "none" })],
        });
        await screen.findByPlaceholderText("Enter an ID");
      });
    });

    describe("has_field_values = list", () => {
      it("should have 'Search the list' as the placeholder text", async () => {
        renderFieldValuesWidget({
          fields: [
            mock(ORDERS.PRODUCT_ID, {
              has_field_values: "list",
              values: [[1234]],
            }),
          ],
        });
        await screen.findByPlaceholderText("Search the list");
      });
    });

    describe("has_field_values = search", () => {
      it("should have 'Search by Category or enter an ID' as the placeholder text", async () => {
        renderFieldValuesWidget({
          fields: [
            mock(ORDERS.PRODUCT_ID, {
              has_field_values: "search",
              remappedField: () => PRODUCTS.CATEGORY,
            }),
          ],
        });
        await screen.findByPlaceholderText("Search by Category or enter an ID");
      });

      it("should not duplicate 'ID' in placeholder when ID itself is searchable", async () => {
        const fields = [
          mock(ORDERS.PRODUCT_ID, {
            base_type: "type/Text",
            has_field_values: "search",
          }),
        ];
        renderFieldValuesWidget({ fields });
        await screen.findByPlaceholderText("Search by Product");
      });
    });
  });

  describe("multiple fields", () => {
    it("list multiple fields together", async () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "list" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      await screen.findByPlaceholderText("Search the list");

      await screen.findByText("AZ");
      await screen.findByText("Facebook");
    });

    it("search if any field is a search", async () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "search" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      await screen.findByPlaceholderText("Search");

      expect(screen.queryByText("AZ")).toBeNull();
      expect(screen.queryByText("Facebook")).toBeNull();
    });

    it("don't list any values if any is set to 'plain input box'", async () => {
      const fields = [
        mock(PEOPLE.SOURCE, { has_field_values: "none" }),
        mock(PEOPLE.STATE, { has_field_values: "list" }),
      ];
      renderFieldValuesWidget({ fields });
      await screen.findByPlaceholderText("Enter some text");

      expect(screen.queryByText("AZ")).toBeNull();
      expect(screen.queryByText("Facebook")).toBeNull();
    });
  });

  describe("prefix", () => {
    it("should render a passed prefix", () => {
      renderFieldValuesWidget({
        fields: [mock(PRODUCTS.PRICE, { has_field_values: "none" })],
        prefix: "$$$",
      });
      expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
    });

    it("should not render a prefix if omitted", () => {
      renderFieldValuesWidget({
        fields: [mock(PRODUCTS.PRICE, { has_field_values: "none" })],
      });
      expect(screen.queryByTestId("input-prefix")).toBeNull();
    });
  });
});
