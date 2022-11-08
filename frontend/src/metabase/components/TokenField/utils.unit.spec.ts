import { parseNumberValue, parseStringValue } from "./utils";

describe("metabase/components/TokenField/utils", () => {
  describe("parseNumberValue", () => {
    it("should return null for non-number values", () => {
      expect(parseNumberValue("")).toBeNull();
      expect(parseNumberValue(" ")).toBeNull();
      expect(parseNumberValue(" foo ")).toBeNull();
      expect(parseNumberValue(null)).toBeNull();
      expect(parseNumberValue("abc 123")).toBeNull();
    });

    it("should return null for numbers that are not finite", () => {
      expect(parseNumberValue("Infinity")).toBeNull();
      expect(parseNumberValue(Infinity)).toBeNull();
      expect(parseNumberValue("-Infinity")).toBeNull();
      expect(parseNumberValue(NaN)).toBeNull();
      expect(parseNumberValue("NaN")).toBeNull();
    });

    it("should return a value parsed as a float", () => {
      expect(parseNumberValue("123")).toBe(123);
      expect(parseNumberValue("123px")).toBe(123);
      expect(parseNumberValue("123.456")).toBe(123.456);
      expect(parseNumberValue("0")).toBe(0);
      expect(parseNumberValue(0)).toBe(0);
      expect(parseNumberValue(123)).toBe(123);
    });
  });

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
