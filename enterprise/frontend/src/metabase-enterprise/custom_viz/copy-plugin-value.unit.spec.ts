import { runInNewContext } from "vm";

import { copyPluginProps, copyPluginValue } from "./copy-plugin-value";

describe("copyPluginValue", () => {
  it("copies through a proxy, which structuredClone rejects", () => {
    const original = {
      list: [1, { deep: true }],
      lookup: new Map([["a", [1]]]),
      tags: new Set(["x"]),
      when: new Date(0),
      none: null,
      big: 10n,
    };

    const copied = copyPluginValue(new Proxy(original, {}));

    expect(copied).toEqual(original);
    expect(copied.list).not.toBe(original.list);
    expect(copied.list[1]).not.toBe(original.list[1]);
    expect(copied.lookup).not.toBe(original.lookup);
    expect(() => structuredClone(copied)).not.toThrow();
  });

  it("copies through a proxied array", () => {
    const original = ["count", { name: "extra" }];

    const copied = copyPluginValue(new Proxy(original, {}));

    expect(copied).toEqual(original);
    expect(Array.isArray(copied)).toBe(true);
    expect(copied[1]).not.toBe(original[1]);
  });

  it("builds the copy in the host realm even when the value's methods belong to another realm", () => {
    const foreign: { list: unknown[]; lookup: Map<unknown, unknown> } =
      runInNewContext(
        '({ list: ["count", [1]], lookup: new Map([["a", 1]]) })',
      );

    const copied = copyPluginValue(new Proxy(foreign, {}));

    expect(copied).toEqual({
      list: ["count", [1]],
      lookup: new Map([["a", 1]]),
    });
    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(copied.list)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(copied.list[1])).toBe(Array.prototype);
    expect(copied.lookup).toBeInstanceOf(Map);
  });

  it("passes primitives through", () => {
    expect(copyPluginValue(7)).toBe(7);
    expect(copyPluginValue(null)).toBeNull();
    expect(copyPluginValue(undefined)).toBeUndefined();
  });

  it.each([
    ["a function", () => 1],
    ["an Intl formatter", new Intl.NumberFormat()],
  ])("rejects a value holding %s", (_name, value) => {
    expect(() => copyPluginValue(new Proxy({ value }, {}))).toThrow(
      /can't be copied/,
    );
  });
});

describe("copyPluginProps", () => {
  it("copies the entries it can and keeps the plugin's callbacks", () => {
    const options = [{ name: "Count", value: "count" }];
    const onFormat = () => "formatted";

    const copied = copyPluginProps(
      new Proxy({ options: new Proxy(options, {}), onFormat }, {}),
    );

    expect(copied.options).toEqual(options);
    expect(copied.options).not.toBe(options);
    expect(() => structuredClone(copied.options)).not.toThrow();
    expect(copied.onFormat).toBe(onFormat);
  });

  it.each([undefined, null, "props", 42])(
    "turns the non-object result %p into no props",
    (props) => {
      expect(copyPluginProps(props)).toEqual({});
    },
  );
});
