import { toHostSettingKeys, toPluginSettings } from "./custom-viz-utils";
import { getCustomVizSettingKeyPrefix } from "./setting-keys";

const PREFIX = getCustomVizSettingKeyPrefix("custom:demo-viz");

describe("toPluginSettings", () => {
  it("strips the plugin's prefix and keeps host settings", () => {
    expect(
      toPluginSettings(
        {
          "card.title": "Title",
          "custom-viz:demo-viz:threshold": 42,
        },
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
        { "card.title": "Host", "custom-viz:demo-viz:card.title": "Plugin" },
        PREFIX,
      ),
    ).toEqual({ "card.title": "Plugin" });
  });
});

describe("toHostSettingKeys", () => {
  it("prefixes every key", () => {
    expect(
      toHostSettingKeys({ threshold: 1, "gauge.segments": [] }, PREFIX),
    ).toEqual({
      "custom-viz:demo-viz:threshold": 1,
      "custom-viz:demo-viz:gauge.segments": [],
    });
  });
});
