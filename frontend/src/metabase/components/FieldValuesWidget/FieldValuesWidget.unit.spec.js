import React from "react";
import "mutationobserver-shim";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";

import {
  FieldValuesWidget,
  searchField,
  isSearchable,
  getValuesMode,
} from "metabase/components/FieldValuesWidget";
import { getMetadata } from "metabase/selectors/metadata";

import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createOrdersTable,
  createProductsTable,
  createPeopleTable,
  createReviewsTable,
  ORDERS,
  PRODUCTS,
  PEOPLE,
  REVIEWS_ID,
  PRODUCT_CATEGORY_VALUES,
  PEOPLE_SOURCE_VALUES,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

const LISTABLE_PK_FIELD_ID = 100;
const STRING_PK_FIELD_ID = 101;
const SEARCHABLE_FK_FIELD_ID = 102;
const LISTABLE_FIELD_WITH_MANY_VALUES_ID = 103;

const database = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createProductsTable(),
    createPeopleTable(),
    createReviewsTable({
      fields: [
        createMockField({
          id: LISTABLE_PK_FIELD_ID,
          table_id: REVIEWS_ID,
          display_name: "ID",
          base_type: "type/BigInteger",
          effective_type: "type/BigInteger",
          semantic_type: "type/PK",
          has_field_values: "list",
          values: [[1234]],
        }),
        createMockField({
          id: STRING_PK_FIELD_ID,
          table_id: REVIEWS_ID,
          display_name: "String ID",
          base_type: "type/Text",
          effective_type: "type/Text",
          semantic_type: "type/PK",
        }),
        createMockField({
          id: SEARCHABLE_FK_FIELD_ID,
          table_id: REVIEWS_ID,
          display_name: "Product ID",
          base_type: "type/Text",
          effective_type: "type/Text",
          semantic_type: "type/FK",
          has_field_values: "search",
        }),
        createMockField({
          id: LISTABLE_FIELD_WITH_MANY_VALUES_ID,
          table_id: REVIEWS_ID,
          display_name: "Big list",
          base_type: "type/Text",
          effective_type: "type/Text",
          has_field_values: "list",
          has_more_values: true,
        }),
      ],
    }),
  ],
});

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
  }),
});

const metadata = getMetadata(state);

function renderFieldValuesWidget({ fields, values, ...props }) {
  const fetchFieldValues = jest.fn();

  renderWithProviders(
    <FieldValuesWidget
      value={[]}
      fields={fields}
      onChange={jest.fn()}
      fetchFieldValues={fetchFieldValues}
      addRemappings={jest.fn()}
      {...props}
    />,
    {
      storeInitialState: state,
    },
  );

  return { fetchFieldValues };
}

describe("FieldValuesWidget", () => {
  describe("category field", () => {
    describe("has_field_values = none", () => {
      const field = metadata.field(PEOPLE.PASSWORD);

      it("should not call fetchFieldValues", () => {
        const { fetchFieldValues } = renderFieldValuesWidget({
          fields: [field],
        });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Enter some text' as the placeholder text", async () => {
        renderFieldValuesWidget({ fields: [field] });
        expect(
          await screen.findByPlaceholderText("Enter some text"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = list", () => {
      const field = metadata.field(PRODUCTS.CATEGORY);

      it("should call fetchFieldValues", () => {
        const { fetchFieldValues } = renderFieldValuesWidget({
          fields: [field],
        });
        expect(fetchFieldValues).toHaveBeenCalledWith(PRODUCTS.CATEGORY);
      });

      it("should not have 'Search the list' as the placeholder text for fields with less or equal than 10 values", async () => {
        renderFieldValuesWidget({ fields: [field] });
        expect(
          screen.queryByPlaceholderText("Search the list"),
        ).not.toBeInTheDocument();
      });

      it("should have 'Enter some text' as the placeholder text for fields with more than 10 values", async () => {
        const field = metadata.field(PEOPLE.STATE);
        renderFieldValuesWidget({ fields: [field] });
        expect(
          await screen.findByPlaceholderText("Enter some text"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = search", () => {
      const field = metadata.field(PRODUCTS.VENDOR);

      it("should not call fetchFieldValues", () => {
        const { fetchFieldValues } = renderFieldValuesWidget({
          fields: [field],
        });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Search by Vendor' as the placeholder text", async () => {
        renderFieldValuesWidget({ fields: [field] });
        expect(
          await screen.findByPlaceholderText("Search by Vendor"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("id field", () => {
    describe("has_field_values = none", () => {
      it("should have 'Enter an ID' as the placeholder text", async () => {
        renderFieldValuesWidget({
          fields: [metadata.field(ORDERS.PRODUCT_ID)],
        });
        expect(
          await screen.findByPlaceholderText("Enter an ID"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = list", () => {
      it("should have 'Search the list' as the placeholder text", async () => {
        renderFieldValuesWidget({
          fields: [metadata.field(LISTABLE_PK_FIELD_ID)],
        });
        expect(
          await screen.findByPlaceholderText("Search the list"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = search", () => {
      it("should have 'Search by Category or enter an ID' as the placeholder text", async () => {
        const field = metadata.field(SEARCHABLE_FK_FIELD_ID).clone();
        const remappedField = metadata.field(PRODUCTS.CATEGORY);
        field.remappedField = () => remappedField;

        renderFieldValuesWidget({ fields: [field] });

        expect(
          await screen.findByPlaceholderText(
            "Search by Category or enter an ID",
          ),
        ).toBeInTheDocument();
      });

      it("should not duplicate 'ID' in placeholder when ID itself is searchable", async () => {
        renderFieldValuesWidget({
          fields: [metadata.field(SEARCHABLE_FK_FIELD_ID)],
        });
        expect(
          await screen.findByPlaceholderText("Search by Product"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("multiple fields", () => {
    it("list multiple fields together", async () => {
      const categoryField = metadata.field(PRODUCTS.CATEGORY).clone();
      categoryField.values = PRODUCT_CATEGORY_VALUES.values;

      const sourceField = metadata.field(PEOPLE.SOURCE).clone();
      sourceField.values = PEOPLE_SOURCE_VALUES.values;

      renderFieldValuesWidget({ fields: [categoryField, sourceField] });

      expect(
        await screen.findByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Doohickey")).toBeInTheDocument();
      expect(await screen.findByText("Affiliate")).toBeInTheDocument();
    });

    it("search if any field is a search", async () => {
      renderFieldValuesWidget({
        fields: [
          metadata.field(PRODUCTS.CATEGORY),
          metadata.field(PRODUCTS.VENDOR),
        ],
      });

      await screen.findByPlaceholderText("Search");

      expect(screen.queryByText("AZ")).not.toBeInTheDocument();
      expect(screen.queryByText("Facebook")).not.toBeInTheDocument();
    });

    it("don't list any values if any is set to 'plain input box'", async () => {
      renderFieldValuesWidget({
        fields: [metadata.field(PEOPLE.PASSWORD), metadata.field(PEOPLE.STATE)],
      });

      await screen.findByPlaceholderText("Enter some text");

      expect(screen.queryByText("AZ")).not.toBeInTheDocument();
      expect(screen.queryByText("Facebook")).not.toBeInTheDocument();
    });
  });

  describe("prefix", () => {
    it("should render a passed prefix", () => {
      renderFieldValuesWidget({
        fields: [metadata.field(PRODUCTS.PRICE)],
        prefix: "$$$",
      });
      expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
    });

    it("should not render a prefix if omitted", () => {
      renderFieldValuesWidget({ fields: [metadata.field(PRODUCTS.PRICE)] });
      expect(screen.queryByTestId("input-prefix")).not.toBeInTheDocument();
    });
  });

  describe("searchField", () => {
    describe("`disablePKRemappingForSearch` is true and field is a PK", () => {
      const disablePKRemappingForSearch = true;

      const stringPKField = metadata.field(STRING_PK_FIELD_ID);
      const numberPKField = metadata.field(PRODUCTS.ID);

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
      const stringField = metadata.field(PRODUCTS.TITLE);
      const remappedField = metadata.field(PRODUCTS.CATEGORY).clone();
      remappedField.remappedField = () => stringField;

      it("should return the remapped field", () => {
        expect(searchField(remappedField)).toBe(stringField);
      });
    });

    describe("when the field is remapped to a non-searchable field", () => {
      it("should ignore it and return the original field, assuming it is searchable", () => {
        const numberField = metadata.field(ORDERS.TOTAL);

        const remappedField = metadata.field(PRODUCTS.CATEGORY).clone();
        remappedField.remappedField = () => numberField;

        const nonSearchableRemappedField = metadata.field(PRODUCTS.ID);
        nonSearchableRemappedField.remappedField = () => numberField;

        expect(searchField(remappedField)).toBe(remappedField);
        expect(searchField(nonSearchableRemappedField)).toBeNull();
      });
    });

    it("should return the field if it is searchable", () => {
      const searchableField = metadata.field(PRODUCTS.TITLE);
      expect(searchField(searchableField)).toBe(searchableField);
    });

    it("should return null if the field is not searchable", () => {
      const nonSearchableField = metadata.field(PRODUCTS.ID);
      expect(searchField(nonSearchableField)).toBeNull();
    });
  });

  describe("isSearchable", () => {
    const listField = metadata.field(PRODUCTS.CATEGORY);
    const searchField = metadata.field(PRODUCTS.VENDOR);
    const nonExhaustiveListField = metadata.field(
      LISTABLE_FIELD_WITH_MANY_VALUES_ID,
    );

    const idField = metadata.field(PRODUCTS.ID);

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
        const fields = [nonExhaustiveListField, listField];
        expect(isSearchable({ fields })).toBe(true);
      });
    });
  });

  describe("getValuesMode", () => {
    describe("when passed no fields", () => {
      it("should return 'none'", () => {
        expect(getValuesMode({ fields: [] })).toBe("none");
      });
    });

    describe("when passed fields that are searchable", () => {
      it("should return 'search'", () => {
        const fields = [metadata.field(PRODUCTS.VENDOR)];
        expect(getValuesMode({ fields })).toBe("search");
      });
    });

    describe("when passed fields that are not searchable but listable", () => {
      it("should return 'list'", () => {
        const fields = [metadata.field(PRODUCTS.CATEGORY)];
        expect(getValuesMode({ fields })).toBe("list");
      });
    });

    describe("when passed fields that are not searchable and not listable", () => {
      it("should return 'none'", () => {
        const fields = [metadata.field(ORDERS.SUBTOTAL)];
        expect(getValuesMode({ fields })).toBe("none");
      });
    });
  });
});
