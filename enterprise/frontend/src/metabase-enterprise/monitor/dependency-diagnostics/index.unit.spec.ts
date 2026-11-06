import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";

import { getDependencyDiagnosticsRoutes } from "./routes";

import { initializePlugin } from "./index";

describe("metabase-enterprise/monitor/dependency-diagnostics initializePlugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("registers the routes on every instance, feature or not", () => {
    initializePlugin();

    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes).toBe(
      getDependencyDiagnosticsRoutes,
    );
  });

  it("resets to the OSS default on reinitialize()", () => {
    initializePlugin();
    reinitialize();

    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes).toBeUndefined();
  });
});
