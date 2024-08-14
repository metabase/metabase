import { isPositiveInteger, parseNumberValue } from "./number";

describe("metabase/lib/number", () => {
  describe("isPositiveInteger", () => {
    it("should be be true for a positive integer", () => {
      expect(isPositiveInteger(123)).toBe(true);
    });

    it("should be false for a negative integer", () => {
      expect(isPositiveInteger(-123)).toBe(false);
    });

    it("should be false for a non-integer number", () => {
      expect(isPositiveInteger(123.45)).toBe(false);
      expect(isPositiveInteger(Infinity)).toBe(false);
      expect(isPositiveInteger(NaN)).toBe(false);
    });

    it("should be true for a string that is a positive integer", () => {
      expect(isPositiveInteger("123")).toBe(true);
      expect(isPositiveInteger("0123")).toBe(true);
    });

    it("should be false for a string that contains non-number characters", () => {
      expect(isPositiveInteger("-123")).toBe(false);
      expect(isPositiveInteger("123.45")).toBe(false);
      expect(isPositiveInteger("123abc")).toBe(false);
      expect(isPositiveInteger("abc123")).toBe(false);
      expect(isPositiveInteger("abc")).toBe(false);
    });
  });

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
});
