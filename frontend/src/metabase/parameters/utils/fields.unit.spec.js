import Field from "metabase-lib/lib/metadata/Field";
import { hasFieldValues, hasFields } from "./fields";

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
});
