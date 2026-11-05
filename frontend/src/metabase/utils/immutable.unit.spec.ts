import { deepFreeze } from "__support__/deep-freeze";

import { getByPath, produce } from "./immutable";

describe("produce", () => {
  it("applies the recipe without changing the base", () => {
    const base = deepFreeze({ nested: { a: 1 }, other: { x: 1 } });

    const result = produce(base, (draft) => {
      draft.nested.a = 2;
    });

    expect(result).toEqual({ nested: { a: 2 }, other: { x: 1 } });
    expect(base.nested.a).toBe(1);
    expect(result.other).toBe(base.other);
  });

  it("does not freeze the result or its untouched subtrees", () => {
    const base = { nested: { a: 1 }, other: { x: 1 } };

    const result = produce(base, (draft) => {
      draft.nested.a = 2;
    });

    expect(Object.isFrozen(result)).toBe(false);
    expect(Object.isFrozen(result.nested)).toBe(false);
    expect(Object.isFrozen(result.other)).toBe(false);
  });

  it("returns the base when the recipe changes nothing", () => {
    const base = { nested: { a: 1 } };

    expect(produce(base, () => {})).toBe(base);
  });
});

describe("getByPath", () => {
  const value = {
    a: { list: [10, 20], text: "abc", zero: 0, empty: "", nothing: null },
  };

  it("reads nested object keys and array indexes", () => {
    expect(getByPath(value, ["a", "list", 1])).toBe(20);
    expect(getByPath(value, ["a", "text", "length"])).toBe(3);
  });

  it("returns the value itself for an empty path", () => {
    expect(getByPath(value, [])).toBe(value);
    expect(getByPath(0, [])).toBe(0);
  });

  it("returns undefined for a missing key", () => {
    expect(getByPath(value, ["a", "missing"])).toBeUndefined();
    expect(getByPath(value, ["missing", "x"])).toBeUndefined();
  });

  it("returns undefined as soon as a step is null or undefined", () => {
    expect(getByPath(value, ["a", "nothing", "x"])).toBeUndefined();
    expect(getByPath(undefined, ["a"])).toBeUndefined();
    expect(getByPath(null, ["a"])).toBeUndefined();
  });

  it("returns undefined when a step is a falsy primitive", () => {
    expect(getByPath(value, ["a", "zero", "toFixed"])).toBeUndefined();
    expect(getByPath(value, ["a", "empty", "length"])).toBeUndefined();
  });
});
