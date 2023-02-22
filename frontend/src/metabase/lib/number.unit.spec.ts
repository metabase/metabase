import { isPositiveInteger } from "./number";

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
});
