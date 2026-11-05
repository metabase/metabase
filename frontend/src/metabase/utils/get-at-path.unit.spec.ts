import { getAtPath } from "./get-at-path";

describe("getAtPath", () => {
  it("reads nested values", () => {
    expect(getAtPath({ a: { b: { c: 1 } } }, ["a", "b", "c"])).toBe(1);
  });

  it("reads array items by index", () => {
    expect(getAtPath({ a: [{ b: 1 }, { b: 2 }] }, ["a", 1, "b"])).toBe(2);
  });

  it("returns the root for an empty path", () => {
    const root = { a: 1 };
    expect(getAtPath(root, [])).toBe(root);
  });

  it("returns undefined when a step is missing", () => {
    expect(getAtPath({ a: {} }, ["a", "b", "c"])).toBeUndefined();
    expect(getAtPath({ a: null }, ["a", "b"])).toBeUndefined();
    expect(getAtPath(undefined, ["a"])).toBeUndefined();
  });

  it("returns undefined when a step is a primitive", () => {
    expect(getAtPath({ a: "abc" }, ["a", 0])).toBeUndefined();
    expect(getAtPath({ a: 1 }, ["a", "b"])).toBeUndefined();
  });
});
