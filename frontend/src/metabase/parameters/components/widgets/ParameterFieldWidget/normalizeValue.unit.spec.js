import { normalizeValue } from "./normalizeValue";

it("returns empty array if value is null", () => {
  const value = null;
  const expected = [];

  const normalized = normalizeValue(value);

  expect(normalized).toEqual(expected);
});

it("returns value if value is an array", () => {
  const value = [1];

  const normalized = normalizeValue(value);

  expect(normalized).toBe(value);
});

it("returns value as item of array if passed value is not an array", () => {
  const value = 1;

  const normalized = normalizeValue(value);

  expect(normalized).toEqual([value]);
});
