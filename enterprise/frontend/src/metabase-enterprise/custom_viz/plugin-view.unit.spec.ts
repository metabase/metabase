import { createMockSingleSeries } from "metabase-types/api/mocks";
import { isFunction, isObject } from "metabase-types/guards";

import {
  toHostSettings,
  toPluginSeries,
  toPluginSettings,
} from "./plugin-view";

const PREFIX = "custom-viz:demo-viz:";

describe("toPluginSeries", () => {
  it("hands the plugin a copy of only the documented series fields", () => {
    const series = [createMockSingleSeries({})];

    const pluginSeries = toPluginSeries(series, PREFIX);

    expect(Object.keys(pluginSeries[0]).sort()).toEqual(["data", "error"]);
    expect(pluginSeries[0].data).toEqual(series[0].data);
    expect(pluginSeries[0].data).not.toBe(series[0].data);
  });

  it("keeps plugin mutations away from the host series", () => {
    const series = [createMockSingleSeries({})];
    const { data } = series[0];

    const pluginSeries = toPluginSeries(series, PREFIX);
    pluginSeries[0].data.rows.push([1]);

    expect(data.rows).toEqual([]);
  });

  it("gives each plugin its own copy of the data", () => {
    const series = [createMockSingleSeries({})];

    const other = toPluginSeries(series, "custom-viz:other:");
    other[0].data.rows.push([1]);

    expect(toPluginSeries(series, PREFIX)[0].data.rows).toEqual([]);
  });

  it("reuses the copy for the same series", () => {
    const series = [createMockSingleSeries({})];

    expect(toPluginSeries(series, PREFIX)).toBe(toPluginSeries(series, PREFIX));
    expect(toPluginSeries([...series], PREFIX)).not.toBe(
      toPluginSeries(series, PREFIX),
    );
  });

  it("reuses the data clone when the series array is rebuilt", () => {
    const series = [createMockSingleSeries({})];
    const rebuilt = series.map((single) => ({
      ...single,
      card: { ...single.card },
    }));

    expect(toPluginSeries(rebuilt, PREFIX)[0].data).toBe(
      toPluginSeries(series, PREFIX)[0].data,
    );
  });

  it("preserves Map and Date column values a JSON round-trip would corrupt", () => {
    const remapping = new Map([[1, "One"]]);
    const series = [createMockSingleSeries({})];
    series[0].data.cols[0].remapping = remapping;
    series[0].data.rows = [[new Date("2020-01-01T00:00:00.000Z")]];

    const pluginSeries = toPluginSeries(series, PREFIX);
    const pluginRemapping = Reflect.get(
      pluginSeries[0].data.cols[0],
      "remapping",
    );

    const getEntry =
      isObject(pluginRemapping) && isFunction(pluginRemapping.get)
        ? pluginRemapping.get
        : null;

    if (!getEntry) {
      throw new Error("Expected the plugin column to keep its remapping Map");
    }

    expect(pluginRemapping).not.toBe(remapping);
    expect(getEntry.call(pluginRemapping, 1)).toBe("One");
    expect(typeof pluginSeries[0].data.rows[0][0]).not.toBe("string");
  });
});

describe("toPluginSettings", () => {
  it("strips the plugin's prefix and keeps host settings", () => {
    expect(
      toPluginSettings(
        { "card.title": "Title", [`${PREFIX}threshold`]: 42 },
        PREFIX,
      ),
    ).toEqual({ "card.title": "Title", threshold: 42 });
  });

  it("drops other plugins' settings", () => {
    expect(
      toPluginSettings({ "custom-viz:other:threshold": 1 }, PREFIX),
    ).toEqual({});
  });

  it("lets a plugin setting shadow a same-named host setting", () => {
    expect(
      toPluginSettings(
        { "card.title": "Host", [`${PREFIX}card.title`]: "Plugin" },
        PREFIX,
      ),
    ).toEqual({ "card.title": "Plugin" });
  });

  it("keeps a plugin's mutation of a nested value away from the host settings", () => {
    const clickBehavior = { type: "crossfilter" };
    const settings = { click_behavior: clickBehavior };

    const pluginSettings = toPluginSettings(settings, PREFIX);
    const pluginClickBehavior: unknown = Reflect.get(
      pluginSettings,
      "click_behavior",
    );
    if (!isObject(pluginClickBehavior)) {
      throw new Error("Expected the plugin to see click_behavior");
    }
    pluginClickBehavior.type = "link";

    expect(clickBehavior.type).toBe("crossfilter");
  });

  it("keeps an undefined host value as an own key", () => {
    const pluginSettings = toPluginSettings(
      { click_behavior: undefined },
      PREFIX,
    );

    expect(Object.hasOwn(pluginSettings, "click_behavior")).toBe(true);
  });

  it("preserves a Map setting value a JSON round-trip would corrupt", () => {
    const pluginSettings = toPluginSettings(
      { [`${PREFIX}lookup`]: new Map([["a", 1]]) },
      PREFIX,
    );
    const lookup = Reflect.get(pluginSettings, "lookup");
    const getEntry =
      isObject(lookup) && isFunction(lookup.get) ? lookup.get : null;

    if (!getEntry) {
      throw new Error("Expected the plugin to keep its Map setting");
    }

    expect(getEntry.call(lookup, "a")).toBe(1);
  });

  it("keeps a plugin setting whose value arrives as a membrane proxy", () => {
    const pluginSettings = toPluginSettings(
      { [`${PREFIX}columns`]: new Proxy(["count"], {}) },
      PREFIX,
    );

    expect(pluginSettings.columns).toEqual(["count"]);
  });

  it("exposes column as a callable whose results can't poison the host", () => {
    const columnSettings = { prefix: "$" };
    const settings = { column: () => columnSettings };

    const pluginSettings = toPluginSettings(settings, PREFIX);
    const column = Reflect.get(pluginSettings, "column");

    if (!isFunction(column)) {
      throw new Error("Expected the plugin to see the column function");
    }

    const col = { name: "X" };
    const first = column(col);

    if (!isObject(first)) {
      throw new Error("Expected column settings");
    }

    first.prefix = "mutated";

    expect(columnSettings.prefix).toBe("$");
    expect(column(col)).toEqual({ prefix: "$", column: col });
  });

  it("hands the caller's own column back and drops host caches from the result", () => {
    const settings = {
      column: (col: unknown) => ({
        prefix: "$",
        column: col,
        _numberFormatter: new Intl.NumberFormat(),
      }),
    };

    const pluginSettings = toPluginSettings(settings, PREFIX);
    const column = Reflect.get(pluginSettings, "column");

    if (!isFunction(column)) {
      throw new Error("Expected the plugin to see the column function");
    }

    const col = { name: "mine" };
    const result = column(col);

    if (!isObject(result)) {
      throw new Error("Expected column settings");
    }

    expect(result.column).toBe(col);
    expect(Object.hasOwn(result, "_numberFormatter")).toBe(false);
  });

  it("silently drops other function-valued settings", () => {
    const pluginSettings = toPluginSettings(
      { [`${PREFIX}callback`]: () => 1 },
      PREFIX,
    );

    expect(Object.hasOwn(pluginSettings, "callback")).toBe(false);
  });

  it("silently drops values structuredClone rejects", () => {
    const pluginSettings = toPluginSettings(
      { _numberFormatter: new Intl.NumberFormat(), "card.title": "Title" },
      PREFIX,
    );

    expect(Object.hasOwn(pluginSettings, "_numberFormatter")).toBe(false);
    expect(pluginSettings["card.title"]).toBe("Title");
  });

  it("reuses the translation for the same settings object", () => {
    const settings = { [`${PREFIX}threshold`]: 42 };

    expect(toPluginSettings(settings, PREFIX)).toBe(
      toPluginSettings(settings, PREFIX),
    );
    expect(toPluginSettings(settings, "custom-viz:other:")).not.toBe(
      toPluginSettings(settings, PREFIX),
    );
    expect(toPluginSettings({ ...settings }, PREFIX)).not.toBe(
      toPluginSettings(settings, PREFIX),
    );
  });
});

describe("toHostSettings", () => {
  it("prefixes every key", () => {
    expect(
      toHostSettings({ threshold: 1, "gauge.segments": [] }, PREFIX),
    ).toEqual({
      [`${PREFIX}threshold`]: 1,
      [`${PREFIX}gauge.segments`]: [],
    });
  });
});
