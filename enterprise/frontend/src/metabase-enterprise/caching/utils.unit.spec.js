import { validateCacheTTL } from "./utils";

describe("validateCacheTTL", () => {
  const validTestCases = [null, 1, 6, 42];
  const invalidTestCases = [-1, -1.2, 0, 0.5, 4.3];

  validTestCases.forEach(value => {
    it(`should be valid for ${value}`, () => {
      expect(validateCacheTTL(value)).toBe(undefined);
    });
  });

  invalidTestCases.forEach(value => {
    it(`should return error for ${value}`, () => {
      expect(validateCacheTTL(value)).toBe("Must be a positive integer value");
    });
  });
});
