import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";

import { getContentDiagnosticsRoutes } from "./routes";

import { initializePlugin } from "./index";

describe("metabase-enterprise/monitor/content-diagnostics initializePlugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("registers the routes on every instance, feature or not", () => {
    initializePlugin();

    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes).toBe(
      getContentDiagnosticsRoutes,
    );
  });

  it("resets to the OSS default on reinitialize()", () => {
    initializePlugin();
    reinitialize();

    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes).toBeUndefined();
  });
});
