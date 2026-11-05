import { setAtPath } from "./path";

describe("setAtPath", () => {
  it("returns the value for an empty path", () => {
    expect(setAtPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
  });

  it("creates missing intermediate objects", () => {
    expect(setAtPath({}, [1, 2, "x"], "yes")).toEqual({
      1: { 2: { x: "yes" } },
    });
  });

  it("does not mutate the input", () => {
    const root = { a: { b: { c: "old" } } };
    const snapshot = structuredClone(root);

    const result = setAtPath(root, ["a", "b", "c"], "new");

    expect(root).toEqual(snapshot);
    expect(result).toEqual({ a: { b: { c: "new" } } });
    expect(result).not.toBe(root);
    expect(result.a).not.toBe(root.a);
  });

  it("keeps the identity of unchanged sibling branches", () => {
    const root = { a: { x: { v: 1 } }, b: { y: { v: 2 } } };

    const result = setAtPath(root, ["a", "x", "v"], 3);

    expect(result.b).toBe(root.b);
    expect(result.a.x).not.toBe(root.a.x);
    expect(result.a.x.v).toBe(3);
  });

  it("replaces a non-object value along the path with an object", () => {
    const root = { a: "all" };

    expect(setAtPath(root, ["a", "b"], "yes")).toEqual({ a: { b: "yes" } });
    expect(root).toEqual({ a: "all" });
  });
});
