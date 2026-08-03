import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import type { CustomVizPluginId } from "metabase-types/api";

import * as staticVizBundle from "./app-static-viz";
import * as customStaticVizBundle from "./app-static-viz-custom";

type CustomVizFactory = Parameters<
  typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin
>[0];

// Plugin bundles assign this global at eval time, so it isn't part of the
// typed global scope.
const globals = globalThis as {
  __customVizPlugin__?: CustomVizFactory;
};

const OPTIONS_JSON = JSON.stringify({
  tokenFeatures: {},
  applicationColors: {},
  customFormatting: {},
  locale: "en",
});

describe.each([
  ["app-static-viz", staticVizBundle],
  ["app-static-viz-custom", customStaticVizBundle],
])("%s initializeContextJSON", (_name, bundle) => {
  const defaults = {
    customVizRegistry: PLUGIN_CUSTOM_VIZ.customVizRegistry,
    registerCustomVizPlugin: PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin,
  };

  beforeEach(() => {
    // Simulate the EE static override: a live registry that registerCustomVizPlugin fills
    const registry: typeof PLUGIN_CUSTOM_VIZ.customVizRegistry = new Map();
    Object.assign(PLUGIN_CUSTOM_VIZ, {
      customVizRegistry: registry,
      registerCustomVizPlugin: (
        factory: CustomVizFactory,
        id: CustomVizPluginId,
      ) => {
        registry.set(`custom:${id}`, factory({}));
      },
    });
  });

  afterEach(() => {
    Object.assign(PLUGIN_CUSTOM_VIZ, defaults);
    globals.__customVizPlugin__ = undefined;
  });

  it("clears plugin registrations left behind in a pooled context", () => {
    globals.__customVizPlugin__ = () => ({});
    bundle.registerCustomVizPlugin("probe", 1);
    expect(PLUGIN_CUSTOM_VIZ.customVizRegistry.size).toBe(1);

    bundle.initializeContextJSON(OPTIONS_JSON);

    expect(PLUGIN_CUSTOM_VIZ.customVizRegistry.size).toBe(0);
  });
});
