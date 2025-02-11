import { parseNumberExact } from "./number";

describe("metabase/lib/number", () => {
  describe("parseNumberExact", () => {
    it.each([
      { value: null, expectedValue: null },
      { value: undefined, expectedValue: null },
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
      { value: false, expectedValue: null },
      { value: true, expectedValue: null },
    ])('should parse "$value"', ({ value, expectedValue }) => {
      expect(parseNumberExact(value)).toBe(expectedValue);
    });
  });
});
