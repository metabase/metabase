import { isValidField } from "metabase/lib/query/field_ref";

describe("field_ref", () => {
  describe("isValidField", () => {
    it("should be valid for field id", () => {
      expect(isValidField(["field-id", 1])).toBe(true);
    });
    it("should be valid for fk", () => {
      expect(isValidField(["fk->", ["field-id", 1], ["field-id", 2]])).toBe(
        true,
      );
    });
    it("should be valid for joined-field", () => {
      expect(isValidField(["joined-field", "foo", ["field-id", 1]])).toBe(true);
    });
    // TODO: remaininng field types
  });
});
