import { deepMerge } from "./deep-merge";

describe("deepMerge", () => {
  it("merges nested plain objects", () => {
    const target = { a: 1, b: { c: 2, d: 3 } };
    expect(deepMerge(target, { b: { d: 4 } })).toEqual({
      a: 1,
      b: { c: 2, d: 4 },
    });
  });

  it("adds keys that are missing in the target", () => {
    const target: { a: number; b?: { c: number } } = { a: 1 };
    expect(deepMerge(target, { b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
  });

  it("replaces arrays instead of merging them", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [4] })).toEqual({ a: [4] });
  });

  it("replaces values that are not plain objects", () => {
    const date = new Date(0);
    const target: { a: unknown } = { a: { b: 1 } };
    expect(deepMerge(target, { a: date })).toEqual({
      a: date,
    });
  });

  it("does not mutate the inputs", () => {
    const target = { a: { b: 1 } };
    const source = { a: { b: 2 } };
    deepMerge(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(source).toEqual({ a: { b: 2 } });
  });

  it("keeps the identity of unchanged subtrees", () => {
    const target = { a: { b: 1 }, c: { d: 2 } };
    const result = deepMerge(target, { a: { b: 3 } });
    expect(result.c).toBe(target.c);
    expect(result.a).not.toBe(target.a);
  });

  it("returns the target when nothing changes", () => {
    const target = { a: { b: 1 } };
    expect(deepMerge(target, { a: { b: 1 } })).toBe(target);
    expect(deepMerge(target, {})).toBe(target);
  });

  it("returns the target when the source is null or undefined", () => {
    const target = { a: 1 };
    expect(deepMerge(target, null)).toBe(target);
    expect(deepMerge(target, undefined)).toBe(target);
  });

  it("allows setting values to undefined", () => {
    const target: { a?: number } = { a: 1 };
    expect(deepMerge(target, { a: undefined })).toEqual({ a: undefined });
  });
});
