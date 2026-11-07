import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ParameterFieldInfo } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";

import { getField } from "./testMocks.spec";
import { getValuesMode, isSearchable, parseStringValue } from "./utils";

function createParameter(fields: ParameterFieldInfo[]): UiParameter {
  return { ...createMockParameter({ type: "string/=" }), fields };
}

describe("Components > FieldValuesWidget > utils", () => {
  describe("parseStringValue", () => {
    it("should return null for falsy and whitespace values", () => {
      expect(parseStringValue("")).toBeNull();
      expect(parseStringValue(" ")).toBeNull();
      expect(parseStringValue(" \n ")).toBeNull();
      expect(parseStringValue(null)).toBeNull();
      expect(parseStringValue(false)).toBeNull();
      expect(parseStringValue(0)).toBeNull();
    });

    it("should return truthy values coerced into strings", () => {
      expect(parseStringValue(123)).toBe("123");
      expect(parseStringValue(true)).toBe("true");
      expect(parseStringValue(" abc 123 \n ")).toBe("abc 123");
    });
  });

  describe("isSearchable", () => {
    const listField = getField(PRODUCTS.CATEGORY);
    const searchField = getField(PEOPLE.EMAIL);
    const idField = getField(PRODUCTS.ID);

    it("should be true when `valuesMode` is already 'search'", () => {
      expect(
        isSearchable({ parameter: createParameter([]), valuesMode: "search" }),
      ).toBe(true);
    });

    it("should be false when one of fields is not searchable", () => {
      const parameter = createParameter([searchField, idField]);
      expect(isSearchable({ parameter })).toBe(false);
    });

    describe("when all fields are searchable", () => {
      it("should be false if there are no fields that require search", () => {
        const parameter = createParameter([listField]);
        expect(isSearchable({ parameter })).toBe(false);
      });

      it("should be true if there is at least one field that requires search", () => {
        const parameter = createParameter([searchField, listField]);
        expect(isSearchable({ parameter })).toBe(true);
      });
    });
  });

  describe("getValuesMode", () => {
    it("should return 'none' without fields", () => {
      expect(getValuesMode(createParameter([]))).toBe("none");
    });

    it("should return 'search' for searchable fields", () => {
      expect(getValuesMode(createParameter([getField(PEOPLE.EMAIL)]))).toBe(
        "search",
      );
    });

    it("should return 'list' for listable fields", () => {
      expect(
        getValuesMode(createParameter([getField(PRODUCTS.CATEGORY)])),
      ).toBe("list");
    });

    it("should return 'none' for fields that are neither searchable nor listable", () => {
      expect(getValuesMode(createParameter([getField(ORDERS.SUBTOTAL)]))).toBe(
        "none",
      );
    });
  });
});
