import { getCustomVizPluginFromSettings } from "./custom-viz-plugins";

describe("getCustomVizPluginFromSettings", () => {
  it("reads embedded runtime plugin metadata from visualization settings", () => {
    expect(
      getCustomVizPluginFromSettings({
        "custom_viz.plugin": {
          id: 42,
          identifier: "reviews-by-stars",
          display_name: "Reviews by Star Rating",
          icon: null,
          bundle_url: "/api/ee/custom-viz-plugin/42/bundle?v=abc",
          bundle_hash: "abc",
          manifest: { name: "reviews-by-stars" },
        },
      }),
    ).toEqual({
      id: 42,
      identifier: "reviews-by-stars",
      display_name: "Reviews by Star Rating",
      icon: null,
      bundle_url: "/api/ee/custom-viz-plugin/42/bundle?v=abc",
      bundle_hash: "abc",
      dev_bundle_url: undefined,
      manifest: { name: "reviews-by-stars" },
    });
  });

  it("ignores incomplete embedded plugin metadata", () => {
    expect(
      getCustomVizPluginFromSettings({
        "custom_viz.plugin": {
          id: 42,
          identifier: "reviews-by-stars",
        },
      }),
    ).toBeUndefined();
  });
});
