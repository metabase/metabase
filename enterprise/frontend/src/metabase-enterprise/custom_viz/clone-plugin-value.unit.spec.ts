import { clonePluginValue } from "./clone-plugin-value";

describe("clonePluginValue", () => {
  it("deep-copies a value structuredClone accepts", () => {
    const original = { list: [1, { deep: true }], when: new Date(0) };

    const cloned = clonePluginValue(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.list[1]).not.toBe(original.list[1]);
  });

  it("copies through a proxy, which structuredClone rejects", () => {
    const original = {
      list: [1, { deep: true }],
      lookup: new Map([["a", [1]]]),
      tags: new Set(["x"]),
      when: new Date(0),
      none: null,
      big: 10n,
    };

    const cloned = clonePluginValue(new Proxy(original, {}));

    expect(cloned).toEqual(original);
    expect(cloned.list).not.toBe(original.list);
    expect(cloned.list[1]).not.toBe(original.list[1]);
    expect(cloned.lookup).not.toBe(original.lookup);
    expect(() => structuredClone(cloned)).not.toThrow();
  });

  it("copies through a proxied array", () => {
    const original = ["count", { name: "extra" }];

    const cloned = clonePluginValue(new Proxy(original, {}));

    expect(cloned).toEqual(original);
    expect(Array.isArray(cloned)).toBe(true);
    expect(cloned[1]).not.toBe(original[1]);
  });

  it.each([
    ["a function", () => 1],
    ["an Intl formatter", new Intl.NumberFormat()],
  ])("rejects a proxied value holding %s", (_name, value) => {
    expect(() => clonePluginValue(new Proxy({ value }, {}))).toThrow(
      /can't be copied/,
    );
  });
});
