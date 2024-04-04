import { parseStringValue } from "./utils";

describe("metabase/components/TokenField/utils", () => {
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
});
