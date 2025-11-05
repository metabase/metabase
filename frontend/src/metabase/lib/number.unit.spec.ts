import { parseNumber, parseNumberValue } from "./number";

describe("metabase/lib/number", () => {
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

  describe("parseNumber", () => {
    it.each([
      { value: "", expectedValue: null },
      { value: " ", expectedValue: null },
      { value: "Infinity", expectedValue: null },
      { value: "-Infinity", expectedValue: null },
      { value: "NaN", expectedValue: null },
      { value: "0", expectedValue: 0 },
      { value: "10", expectedValue: 10 },
      { value: "-10", expectedValue: -10 },
      { value: "9007199254740993", expectedValue: 9007199254740993n },
      { value: "-9007199254740993", expectedValue: -9007199254740993n },
      { value: "10.1", expectedValue: 10.1 },
      { value: "-10.1", expectedValue: -10.1 },
    ])('should parse "$value"', ({ value, expectedValue }) => {
      expect(parseNumber(value)).toBe(expectedValue);
    });
  });
});
