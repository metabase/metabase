import {
  isValidField,
  isExpressionField,
} from "metabase-lib/v1/queries/utils/field-ref";

describe("field_ref", () => {
  describe("isValidField", () => {
    it("should be valid for field id", () => {
      expect(isValidField(["field", 1, null])).toBe(true);
    });
    it("should be valid for fk", () => {
      expect(isValidField(["field", 2, { "source-field": 1 }])).toBe(true);
    });
    it("should be valid for joined field", () => {
      expect(isValidField(["field", 1, { "join-alias": "foo" }])).toBe(true);
    });
    // TODO: remaininng field types
  });
  describe("isExpressionField", () => {
    it("should be valid for an expression clause", () => {
      expect(isExpressionField(["expression", "foo"])).toBeTruthy();
    });
  });
});
