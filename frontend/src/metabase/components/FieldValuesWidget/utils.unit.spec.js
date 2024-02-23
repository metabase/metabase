import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";

import {
  metadata,
  LISTABLE_FIELD_WITH_MANY_VALUES_ID,
  STRING_PK_FIELD_ID,
} from "./testMocks";
import { isSearchable, getValuesMode, searchField } from "./utils";

describe("Components > FieldValuesWidget > utils", () => {
  describe("isSearchable", () => {
    const listField = metadata.field(PRODUCTS.CATEGORY);
    const searchField = metadata.field(PEOPLE.EMAIL);
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
        const fields = [metadata.field(PEOPLE.EMAIL)];
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
});
