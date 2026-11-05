import { deepFreeze } from "__support__/deep-freeze";

import { mergeDeep } from "./merge-deep";

type Settings = {
  title?: string;
  color?: string | null;
  size?: number;
  nested?: { a?: number; b?: number; deep?: { c?: number } };
  other?: { x?: number };
  list?: number[];
  date?: Date;
};

describe("mergeDeep", () => {
  it("merges plain objects recursively", () => {
    const target: Settings = deepFreeze({
      title: "a",
      nested: { a: 1, b: 2, deep: { c: 3 } },
    });

    expect(mergeDeep(target, { nested: { b: 5, deep: { c: 6 } } })).toEqual({
      title: "a",
      nested: { a: 1, b: 5, deep: { c: 6 } },
    });
  });

  it("replaces arrays instead of merging them", () => {
    const target: Settings = deepFreeze({ list: [1, 2, 3] });

    expect(mergeDeep(target, { list: [9] })).toEqual({ list: [9] });
  });

  it("replaces primitives, null and non-plain objects", () => {
    const date = new Date(0);
    const target: Settings = deepFreeze({
      title: "a",
      color: "red",
      nested: { a: 1 },
      date: new Date(1),
    });

    const result = mergeDeep(target, { title: "b", color: null, date });

    expect(result).toEqual({
      title: "b",
      color: null,
      nested: { a: 1 },
      date,
    });
    expect(result.date).toBe(date);
  });

  it("replaces a non-plain target value with a plain source object", () => {
    const target: { value: Date | { a: number } } = { value: new Date(0) };

    expect(mergeDeep(target, { value: { a: 1 } })).toEqual({
      value: { a: 1 },
    });
  });

  it("returns the target when the source is null or undefined", () => {
    const target: Settings = { title: "a" };

    expect(mergeDeep(target, null)).toBe(target);
    expect(mergeDeep(target, undefined)).toBe(target);
  });

  it("keeps a key absent when the source sets it to undefined", () => {
    const target: Settings = deepFreeze({ title: "a" });

    const result = mergeDeep(target, { size: undefined });

    expect(result).toBe(target);
    expect("size" in result).toBe(false);
  });

  it("sets an existing key to undefined when the source does", () => {
    const target: Settings = deepFreeze({ title: "a", size: 1 });

    const result = mergeDeep(target, { size: undefined });

    expect(result).toEqual({ title: "a" });
    expect("size" in result).toBe(true);
  });

  it("returns the target itself when nothing changes", () => {
    const target: Settings = deepFreeze({
      title: "a",
      nested: { a: 1, deep: { c: 2 } },
      list: [1],
    });

    expect(
      mergeDeep(target, { title: "a", nested: { a: 1, deep: { c: 2 } } }),
    ).toBe(target);
  });

  it("keeps the references of unchanged subtrees", () => {
    const target: Settings = deepFreeze({
      nested: { a: 1, deep: { c: 2 } },
      other: { x: 1 },
      list: [1],
    });

    const result = mergeDeep(target, { nested: { a: 5 } });

    expect(result).not.toBe(target);
    expect(result.nested).not.toBe(target.nested);
    expect(result.nested?.deep).toBe(target.nested?.deep);
    expect(result.other).toBe(target.other);
    expect(result.list).toBe(target.list);
  });

  it("keeps the source subtree reference when the target key is missing", () => {
    const other = { x: 1 };

    expect(mergeDeep<Settings>({ title: "a" }, { other }).other).toBe(other);
  });

  it("keeps the key order of the target and appends new keys", () => {
    const target: Settings = { title: "a", color: "red", size: 1 };

    const result = mergeDeep(target, { size: 2, title: "b", other: { x: 1 } });

    expect(Object.keys(result)).toEqual(["title", "color", "size", "other"]);
  });

  it("does not change the target or the source", () => {
    const target: Settings = deepFreeze({ nested: { a: 1 }, list: [1] });
    const source: Settings = deepFreeze({ nested: { b: 2 }, list: [2] });

    expect(() => mergeDeep(target, source)).not.toThrow();
  });

  it("merges a root array target with an array source index by index", () => {
    const target = deepFreeze([{ a: 1, b: 2 }, { a: 3 }, { a: 4 }]);

    expect(mergeDeep(target, [{ a: 9 }])).toEqual([
      { a: 9, b: 2 },
      { a: 3 },
      { a: 4 },
    ]);
  });

  it("assigns the keys of a plain object source onto an array target", () => {
    const target: { list: number[] | Record<string, number> } = deepFreeze({
      list: [1, 2, 3],
    });

    expect(mergeDeep(target, { list: { 0: 9 } })).toEqual({ list: [9, 2, 3] });
  });

  it("preserves null-prototype objects", () => {
    const nested: Record<string, number> = Object.assign(Object.create(null), {
      a: 1,
    });
    const target = { nested };

    const result = mergeDeep(target, { nested: { b: 2 } });

    expect(Object.getPrototypeOf(result.nested)).toBeNull();
    expect({ ...result.nested }).toEqual({ a: 1, b: 2 });
  });
});
