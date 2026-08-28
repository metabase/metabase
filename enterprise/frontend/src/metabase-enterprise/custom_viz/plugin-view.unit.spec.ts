import { createMockSingleSeries } from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import {
  type PluginSeries,
  toHostSettings,
  toPluginSeries,
  toPluginSettings,
} from "./plugin-view";

// The SDK types leave the card out, but the host hands it over at runtime.
function getPluginCard(single: PluginSeries[number]) {
  const card = Reflect.get(single, "card");
  if (!isObject(card)) {
    throw new Error("Expected the plugin series to carry the card");
  }
  return card;
}

const PREFIX = "custom-viz:demo-viz:";

describe("toPluginSeries", () => {
  it("hands the plugin a copy of each card", () => {
    const series = [
      createMockSingleSeries({ visualization_settings: { threshold: 1 } }),
    ];
    const { card } = series[0];

    const pluginSeries = toPluginSeries(series);

    expect(getPluginCard(pluginSeries[0])).toEqual(card);
    expect(getPluginCard(pluginSeries[0])).not.toBe(card);
    expect(pluginSeries[0].data).toBe(series[0].data);
  });

  it("keeps plugin mutations away from the host card", () => {
    const series = [createMockSingleSeries({ visualization_settings: {} })];
    const { card } = series[0];

    const pluginSettings = getPluginCard(
      toPluginSeries(series)[0],
    ).visualization_settings;
    if (!isObject(pluginSettings)) {
      throw new Error("Expected the plugin card to carry settings");
    }
    pluginSettings["graph.goal_value"] = 1;

    expect(card.visualization_settings).toEqual({});
  });

  it("reuses the copy for the same series", () => {
    const series = [createMockSingleSeries({})];

    expect(toPluginSeries(series)).toBe(toPluginSeries(series));
    expect(toPluginSeries([...series])).not.toBe(toPluginSeries(series));
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
