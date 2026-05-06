import {
  getWidgetMountPluginId,
  isWidgetMount,
  wrapPluginWidget,
} from "./widget-mount";

describe("widget-mount host trust boundary", () => {
  it("isWidgetMount only accepts host-allocated mounts", () => {
    const wrapped = wrapPluginWidget(
      (() => ({
        update() {},
        unmount() {},
      })) as never,
      1,
    );
    expect(isWidgetMount(wrapped)).toBe(true);
  });

  it("isWidgetMount rejects plain functions", () => {
    expect(isWidgetMount(() => null)).toBe(false);
    expect(isWidgetMount(function noop() {})).toBe(false);
    const arrow = (_a: unknown, _b: unknown) => ({
      update() {},
      unmount() {},
    });
    expect(isWidgetMount(arrow)).toBe(false);
  });

  it("isWidgetMount rejects forged string-keyed brands from a plugin", () => {
    // A malicious plugin might stamp any property name on a value before
    // returning it across the membrane. The host's check is keyed by a
    // host-realm Symbol the plugin can't reach, so string-keyed markers —
    // even ones that look plausible — must not pass.
    const forged = Object.assign(() => null, {
      __metabaseWidgetMount__: true,
      "metabase.host.trusted-widget-mount": true,
    });
    expect(isWidgetMount(forged)).toBe(false);
  });

  it("isWidgetMount rejects forged Symbol.for brands from a plugin", () => {
    // `Symbol.for(name)` returns the same symbol across realms via the
    // global registry — but we deliberately use a fresh `Symbol(...)`
    // host-side, so a registry lookup with the same description does not
    // produce the host's symbol.
    const fakeSym = Symbol.for("metabase.host.trusted-widget-mount");
    const forged = Object.assign(() => null, { [fakeSym]: true });
    expect(isWidgetMount(forged)).toBe(false);
  });

  it("wrapped mount forwards to the plugin function", () => {
    const inner = jest.fn().mockReturnValue({
      update: jest.fn(),
      unmount: jest.fn(),
    });
    const wrapped = wrapPluginWidget(inner as never, 7);
    const container = document.createElement("div");
    const props = { id: "x" };

    wrapped(container, props);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledWith(container, props);
  });

  it("getWidgetMountPluginId recovers the pluginId from a trusted mount", () => {
    const wrapped = wrapPluginWidget(
      (() => ({ update() {}, unmount() {} })) as never,
      99,
    );
    expect(getWidgetMountPluginId(wrapped)).toBe(99);
  });

  it("getWidgetMountPluginId returns undefined for non-trusted values", () => {
    const plain = (() => ({ update() {}, unmount() {} })) as never;
    expect(getWidgetMountPluginId(plain)).toBeUndefined();
  });

  it("isWidgetMount returns false for non-function values", () => {
    expect(isWidgetMount("number")).toBe(false);
    expect(isWidgetMount(undefined)).toBe(false);
    expect(isWidgetMount(null)).toBe(false);
    expect(isWidgetMount({})).toBe(false);
    expect(isWidgetMount(42)).toBe(false);
  });
});
