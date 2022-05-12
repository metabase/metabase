import Field from "metabase-lib/lib/metadata/Field";
import { hasFieldValues, getFieldIds } from "./fields";

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
});
