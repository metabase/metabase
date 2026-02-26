import { asNotNull } from "metabase/lib/types";
import type { FieldId } from "metabase-types/api";
import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";

import {
  LISTABLE_FIELD_WITH_MANY_VALUES_ID,
  STRING_PK_FIELD_ID,
  metadata,
} from "./testMocks.spec";
import { getValuesMode, isSearchable, searchField } from "./utils";

const field = (id: FieldId) => asNotNull(metadata.field(id));

describe("Components > FieldValuesWidget > utils", () => {
  describe("isSearchable", () => {
    const listField = field(PRODUCTS.CATEGORY);
    const searchField = field(PEOPLE.EMAIL);
    const nonExhaustiveListField = field(LISTABLE_FIELD_WITH_MANY_VALUES_ID);
    const idField = field(PRODUCTS.ID);

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
        const fields = [field(PEOPLE.EMAIL)];
        expect(getValuesMode({ fields })).toBe("search");
      });
    });

    describe("when passed fields that are not searchable but listable", () => {
      it("should return 'list'", () => {
        const fields = [field(PRODUCTS.CATEGORY)];
        expect(getValuesMode({ fields })).toBe("list");
      });
    });

    describe("when passed fields that are not searchable and not listable", () => {
      it("should return 'none'", () => {
        const fields = [field(ORDERS.SUBTOTAL)];
        expect(getValuesMode({ fields })).toBe("none");
      });
    });
  });

  describe("searchField", () => {
    describe("`disablePKRemappingForSearch` is true and field is a PK", () => {
      const disablePKRemappingForSearch = true;

      const stringPKField = field(STRING_PK_FIELD_ID);
      const numberPKField = field(PRODUCTS.ID);

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
      const stringField = field(PRODUCTS.TITLE);
      const remappedField = field(PRODUCTS.CATEGORY).clone();
      remappedField.remappedExternalField = () => stringField;

      it("should return the remapped field", () => {
        expect(searchField(remappedField)).toBe(stringField);
      });
    });

    describe("when the field is remapped to a non-searchable field", () => {
      it("should ignore it and return the original field, assuming it is searchable", () => {
        const numberField = field(ORDERS.TOTAL);

        const remappedField = field(PRODUCTS.CATEGORY).clone();
        remappedField.remappedExternalField = () => numberField;

        const nonSearchableRemappedField = field(PRODUCTS.ID);
        nonSearchableRemappedField.remappedExternalField = () => numberField;

        expect(searchField(remappedField)).toBe(remappedField);
        expect(searchField(nonSearchableRemappedField)).toBeNull();
      });
    });

    it("should return the field if it is searchable", () => {
      const searchableField = field(PRODUCTS.TITLE);
      expect(searchField(searchableField)).toBe(searchableField);
    });

    it("should return null if the field is not searchable", () => {
      const nonSearchableField = field(PRODUCTS.ID);
      expect(searchField(nonSearchableField)).toBeNull();
    });
  });
});
