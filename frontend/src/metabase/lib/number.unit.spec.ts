import { isPositiveInteger, parseNumberExact } from "./number";

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

  describe("parseNumberExact", () => {
    it.each([
      { value: "", expectedValue: null },
      { value: " ", expectedValue: null },
      { value: "Infinity", expectedValue: null },
      { value: "-Infinity", expectedValue: null },
      { value: "NaN", expectedValue: null },
      { value: "0", expectedValue: 0 },
      { value: "10", expectedValue: 10 },
      { value: "-10", expectedValue: -10 },
      { value: "9007199254740993", expectedValue: "9007199254740993" },
      { value: "-9007199254740993", expectedValue: "-9007199254740993" },
      { value: "10.1", expectedValue: 10.1 },
      { value: "-10.1", expectedValue: -10.1 },
      { value: 0, expectedValue: 0 },
      { value: 10, expectedValue: 10 },
      { value: -10, expectedValue: -10 },
      { value: 10.1, expectedValue: 10.1 },
      { value: -10.1, expectedValue: -10.1 },
      { value: 9007199254740991, expectedValue: 9007199254740991 },
      { value: 1e20, expectedValue: 1e20 },
      { value: Infinity, expectedValue: null },
      { value: -Infinity, expectedValue: null },
      { value: NaN, expectedValue: null },
    ])('should parse "$value"', ({ value, expectedValue }) => {
      expect(parseNumberExact(value)).toBe(expectedValue);
    });
  });
});
