import {
  getCustomVizSettingKeyPrefix,
  isCustomVizSettingKey,
} from "./setting-keys";

describe("getCustomVizSettingKeyPrefix", () => {
  it("namespaces keys by the plugin identifier", () => {
    expect(getCustomVizSettingKeyPrefix("custom:demo-viz")).toBe(
      "custom:demo-viz:",
    );
  });
});

describe("isCustomVizSettingKey", () => {
  it("recognizes keys of any plugin", () => {
    expect(isCustomVizSettingKey("custom:demo-viz:threshold")).toBe(true);
    expect(isCustomVizSettingKey("custom:other:threshold")).toBe(true);
    expect(isCustomVizSettingKey("threshold")).toBe(false);
    expect(isCustomVizSettingKey("custom:demo-viz")).toBe(false);
  });
});
