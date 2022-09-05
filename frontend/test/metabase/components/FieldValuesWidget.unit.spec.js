import React from "react";
import { render, screen } from "@testing-library/react";
import "mutationobserver-shim";

import { ORDERS, PRODUCTS, PEOPLE } from "__support__/sample_database_fixture";
import {
  FieldValuesWidget,
  searchField,
  isSearchable,
  getValuesMode,
} from "metabase/components/FieldValuesWidget";

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

  describe("searchField", () => {
    describe("`disablePKRemappingForSearch` is true and field is a PK", () => {
      const disablePKRemappingForSearch = true;
      const stringPKField = mock(PRODUCTS.ID, {
        base_type: "type/Text",
      });
      const numberPKField = mock(PRODUCTS.ID, {
        base_type: "type/Number",
      });

      it("should return same field when the field is searchable (the field is a string AND a PK)", () => {
        expect(searchField(stringPKField, disablePKRemappingForSearch)).toBe(
          stringPKField,
        );
      });

      it("should return null when field is not searchable (the field is NOT a string PK)", () => {
        expect(
          searchField(numberPKField, disablePKRemappingForSearch),
        ).toBeNull();
      });
    });

    describe("when the field is remapped to a searchable field", () => {
      const stringField = mock(PRODUCTS.TITLE, {});
      const remappedField = mock(PRODUCTS.CATEGORY, {
        remappedField: () => stringField,
      });

      it("should return the remapped field", () => {
        expect(searchField(remappedField)).toBe(stringField);
      });
    });

    describe("when the field is remapped to a non-searchable field", () => {
      it("should ignore it and return the original field, assuming it is searchable", () => {
        const numberField = mock(ORDERS.TOTAL, {});
        const remappedField = mock(PRODUCTS.CATEGORY, {
          remappedField: () => numberField,
        });
        const nonsearchableRemappedField = mock(PRODUCTS.ID, {
          remappedField: () => numberField,
        });

        expect(searchField(remappedField)).toBe(remappedField);
        expect(searchField(nonsearchableRemappedField)).toBeNull();
      });
    });

    it("should return the field if it is searchable", () => {
      const searchableField = mock(PRODUCTS.TITLE, {});
      expect(searchField(searchableField)).toBe(searchableField);
    });

    it("should return null if the field is not searchable", () => {
      const nonsearchableField = mock(PRODUCTS.ID, {});
      expect(searchField(nonsearchableField)).toBeNull();
    });
  });

  describe("isSearchable", () => {
    const listField = mock(PRODUCTS.CATEGORY, { has_field_values: "list" });
    const searchField = mock(PRODUCTS.CATEGORY, { has_field_values: "search" });
    const nonexhaustiveListField = mock(PRODUCTS.CATEGORY, {
      has_field_values: "list",
      has_more_values: true,
    });

    const idField = mock(PRODUCTS.ID, {});

    describe("when the `valuesMode` is already set to 'search'", () => {
      it("should return return true unless fully disabled", () => {
        expect(
          isSearchable({ valuesMode: "search", disableSearch: true }),
        ).toBe(false);
        expect(isSearchable({ valuesMode: "search" })).toBe(true);
      });
    });

    it("should be false when the list of fields includes one that is not searchable", () => {
      const fields = [searchField, idField];
      expect(isSearchable({ fields })).toBe(false);
    });

    describe("when all fields are searchable", () => {
      it("should be false if there are no fields that require search", () => {
        const fields = [listField];
        expect(isSearchable({ fields })).toBe(false);
      });

      it("should be true if there is at least one field that requires search", () => {
        const fields = [searchField, listField];
        expect(isSearchable({ fields })).toBe(true);
      });

      it("should be true if there is at least one field that shows a list but said list is not exhaustive", () => {
        const fields = [nonexhaustiveListField, listField];
        expect(isSearchable({ fields })).toBe(true);
      });
    });
  });

  describe("getValuesMode", () => {
    describe("when passed no fields", () => {
      it("should return 'none'", () => {
        expect(getValuesMode([])).toBe("none");
      });
    });

    describe("when passed fields that are searchable", () => {
      it("it should return 'search'", () => {
        const fields = [
          mock(PRODUCTS.CATEGORY, { has_field_values: "search" }),
        ];
        expect(getValuesMode(fields)).toBe("search");
      });
    });

    describe("when passed fields that are not searchable but listable", () => {
      it("it should return 'list'", () => {
        const fields = [mock(PRODUCTS.CATEGORY, { has_field_values: "list" })];
        expect(getValuesMode(fields)).toBe("list");
      });
    });

    describe("when passed fields that are not searchable and not listable", () => {
      it("it should return 'none'", () => {
        const fields = [mock(PRODUCTS.CATEGORY, { has_field_values: "none" })];
        expect(getValuesMode(fields)).toBe("none");
      });
    });
  });
});
