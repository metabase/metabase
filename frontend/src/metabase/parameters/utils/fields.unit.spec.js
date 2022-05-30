import Field from "metabase-lib/lib/metadata/Field";
import {
  hasFieldValues,
  getFieldIds,
  hasFields,
  isOnlyMappedToFields,
} from "./fields";

describe("parameters/utils/fields", () => {
  describe("hasFieldValues", () => {
    const fieldWithValues = new Field({
      values: [1, 2, 3],
    });
    const fieldWithoutValues = new Field();

    it("should be false when the parameter has no fields", () => {
      expect(hasFieldValues({ fields: [] })).toBe(false);
    });

    it("should be false when fields on the parameter have no values", () => {
      expect(hasFieldValues({ fields: [fieldWithoutValues] })).toBe(false);
    });

    it("should be true when a field on the parameter has values", () => {
      expect(
        hasFieldValues({ fields: [fieldWithoutValues, fieldWithValues] }),
      ).toBe(true);
    });

    it("should handle a parameter with no fields", () => {
      expect(hasFieldValues({})).toBe(false);
    });
  });

  describe("getFieldIds", () => {
    it("should handle a parameter with no fields", () => {
      expect(getFieldIds({})).toEqual([]);
    });

    it("should return number field ids", () => {
      expect(getFieldIds({ field_ids: [1, 2, 3] })).toEqual([1, 2, 3]);
    });

    it("should filter out virtual field ids", () => {
      expect(getFieldIds({ field_ids: [1, "two", 3] })).toEqual([1, 3]);
    });

    it("should favor the field_id prop for whatever reason", () => {
      expect(
        getFieldIds({
          field_id: 1,
          field_ids: [2, 3],
        }),
      ).toEqual([1]);
    });
  });

  describe("hasFields", () => {
    it("should be false when the parameter has no fields", () => {
      expect(hasFields({ fields: [] })).toBe(false);
      expect(hasFields({})).toBe(false);
    });

    it("should be true when a field on the parameter has values", () => {
      const mockField = new Field({ id: 1, name: "foo" });
      expect(hasFields({ fields: [mockField] })).toBe(true);
    });
  });

  describe("isOnlyMappedToFields", () => {
    it("should be false when the parameter has no fields", () => {
      expect(
        isOnlyMappedToFields({ fields: [], hasOnlyFieldTargets: false }),
      ).toBe(false);
    });

    it("should be false in a broken scenario where it has no fields but claims to only target fields", () => {
      expect(
        isOnlyMappedToFields({ fields: [], hasOnlyFieldTargets: true }),
      ).toBe(false);
    });

    it("should be false when the parameter has fields but is mapped to more than fields", () => {
      const mockField = new Field({ id: 1, name: "foo" });
      expect(
        isOnlyMappedToFields({
          fields: [mockField],
          hasOnlyFieldTargets: false,
        }),
      ).toBe(false);
    });

    it("should be true when the parameter has fields and is mapped only to fields", () => {
      const mockField = new Field({ id: 1, name: "foo" });
      expect(
        isOnlyMappedToFields({
          fields: [mockField],
          hasOnlyFieldTargets: true,
        }),
      ).toBe(true);
    });
  });
});
