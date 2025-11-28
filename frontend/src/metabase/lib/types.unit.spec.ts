import { isNotFalsy, removeNullAndUndefinedValues } from "./types";

describe("isNotFalsy", () => {
  // CT1
  it("should return true for non-empty string", () => {
    expect(isNotFalsy("text")).toBe(true);
  });

  // CT2
  it("should return false for empty string", () => {
    expect(isNotFalsy("")).toBe(false);
  });

  // CT3
  it("should return false for boolean false", () => {
    expect(isNotFalsy(false)).toBe(false);
  });

  // CT4
  it("should return false for null", () => {
    expect(isNotFalsy(null)).toBe(false);
  });

  // CT5
  it("should return false for undefined", () => {
    expect(isNotFalsy(undefined)).toBe(false);
  });

  // CT6
  it("should return true for number zero", () => {
    expect(isNotFalsy(0)).toBe(true);
  });

  // CT7
  it("should return true for positive number", () => {
    expect(isNotFalsy(42)).toBe(true);
  });

  // CT8
  it("should return true for empty object", () => {
    expect(isNotFalsy({})).toBe(true);
  });

  // CT9
  it("should return true for empty array", () => {
    expect(isNotFalsy([])).toBe(true);
  });

  // CT10
  it("should work as type guard", () => {
    const value: string | null | undefined | false | "" = "hello";
    expect(isNotFalsy(value)).toBe(true);
    expect(value.toUpperCase()).toBe("HELLO");
  });
});

describe("removeNullAndUndefinedValues", () => {
  it("removes nil values from an object", () => {
    const obj = {
      a: 1,
      b: false,
      c: null,
      d: 0,
      e: "",
      f: "some string",
      g: undefined,
    };
    const keepers = {
      a: 1,
      b: false,
      d: 0,
      e: "",
      f: "some string",
    };
    expect(removeNullAndUndefinedValues(obj)).toEqual(keepers);
  });
});
