import { createMockSingleSeries } from "metabase-types/api/mocks";
import { isFunction, isObject } from "metabase-types/guards";

import {
  type PluginSeries,
  toHostSettings,
  toPluginSeries,
  toPluginSettings,
} from "./plugin-view";

const PREFIX = "custom-viz:demo-viz:";

describe("toPluginSeries", () => {
  it("hands the plugin a copy of each series entry", () => {
    const series = [
      createMockSingleSeries({ visualization_settings: { threshold: 1 } }),
    ];

    const pluginSeries = toPluginSeries(series);

    expect(pluginSeries[0]).toEqual(series[0]);
    expect(getPluginCard(pluginSeries[0])).not.toBe(series[0].card);
    expect(pluginSeries[0].data).not.toBe(series[0].data);
  });

  it("keeps plugin mutations away from the host series", () => {
    const series = [createMockSingleSeries({ visualization_settings: {} })];
    const { card, data } = series[0];

    const pluginSeries = toPluginSeries(series);
    const pluginSettings = getPluginCard(
      pluginSeries[0],
    ).visualization_settings;

    if (!isObject(pluginSettings)) {
      throw new Error("Expected the plugin card to carry settings");
    }

    pluginSettings["graph.goal_value"] = 1;
    pluginSeries[0].data.rows.push([1]);

    expect(card.visualization_settings).toEqual({});
    expect(data.rows).toEqual([]);
  });

  it("reuses the copy for the same series", () => {
    const series = [createMockSingleSeries({})];

    expect(toPluginSeries(series)).toBe(toPluginSeries(series));
    expect(toPluginSeries([...series])).not.toBe(toPluginSeries(series));
  });

  it("preserves Map and Date column values a JSON round-trip would corrupt", () => {
    const remapping = new Map([[1, "One"]]);
    const series = [createMockSingleSeries({})];
    series[0].data.cols[0].remapping = remapping;
    series[0].data.rows = [[new Date("2020-01-01T00:00:00.000Z")]];

    const pluginSeries = toPluginSeries(series);
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

// The SDK types leave the card out, but the host hands it over at runtime.
function getPluginCard(single: PluginSeries[number]) {
  const card = Reflect.get(single, "card");

  if (!isObject(card)) {
    throw new Error("Expected the plugin series to carry the card");
  }

  return card;
}
