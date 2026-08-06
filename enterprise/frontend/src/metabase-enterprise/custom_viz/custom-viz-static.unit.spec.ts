import type { CreateCustomVisualization } from "custom-viz";

import visualizations from "metabase/visualizations";

import {
  customVizRegistry,
  registerCustomVizPlugin,
} from "./custom-viz-static";

const IDENTIFIER = "overwrite-check";
const DISPLAY = `custom:${IDENTIFIER}` as const;
const PLUGIN_ID = 1;

function createPluginFactoryWithSetting(
  settingKey: string,
): CreateCustomVisualization<Record<string, unknown>> {
  return ({ defineSetting }) => ({
    id: IDENTIFIER,
    getName: () => IDENTIFIER,
    checkRenderable: () => {},
    settings: {
      [settingKey]: defineSetting({
        id: settingKey,
        title: settingKey,
        widget: "number",
        getDefault: () => 0,
      }),
    },
    mount: () => ({ update: () => {}, unmount: () => {} }),
    VisualizationComponent: () => null,
    StaticVisualizationComponent: () => null,
  });
}

describe("registerCustomVizPlugin", () => {
  it("replaces a previously registered display so a new bundle version does not keep stale settings definitions", () => {
    registerCustomVizPlugin(
      createPluginFactoryWithSetting("settingV1"),
      IDENTIFIER,
      PLUGIN_ID,
    );
    expect(visualizations.get(DISPLAY)?.settings).toHaveProperty("settingV1");

    registerCustomVizPlugin(
      createPluginFactoryWithSetting("settingV2"),
      IDENTIFIER,
      PLUGIN_ID,
    );

    const registered = visualizations.get(DISPLAY);
    expect(registered?.settings).toHaveProperty("settingV2");
    expect(registered?.settings).not.toHaveProperty("settingV1");
    expect(customVizRegistry.get(DISPLAY)?.settings).toHaveProperty(
      "settingV2",
    );
  });
});
