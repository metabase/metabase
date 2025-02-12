import { parseNumber } from "./numbers";

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
    { value: "9007199254740993", expectedValue: "9007199254740993" },
    { value: "-9007199254740993", expectedValue: "-9007199254740993" },
    { value: "10.1", expectedValue: 10.1 },
    { value: "-10.1", expectedValue: -10.1 },
  ])('should parse "$value"', ({ value, expectedValue }) => {
    expect(parseNumber(value)).toBe(expectedValue);
  });
});
