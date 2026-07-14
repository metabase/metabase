import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDependencyDiagnosticsRoutes } from "./routes";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

// jest.mock replaces the module factory; retype the import as its mock
const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const mockDependenciesFeature = (enabled: boolean) => {
  mockHasPremiumFeature.mockImplementation((feature) =>
    feature === "dependencies" ? enabled : false,
  );
};

describe("metabase-enterprise/monitor/dependency-diagnostics initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("enables dependency diagnostics when the dependencies feature is present", () => {
    mockDependenciesFeature(true);

    initializePlugin();

    expect(PLUGIN_MONITOR.isDependencyDiagnosticsEnabled).toBe(true);
    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes).toBe(
      getDependencyDiagnosticsRoutes,
    );
    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()).not.toBeNull();
  });

  it("leaves the OSS defaults when the dependencies feature is absent", () => {
    mockDependenciesFeature(false);

    initializePlugin();

    expect(PLUGIN_MONITOR.isDependencyDiagnosticsEnabled).toBe(false);
    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()).toBeNull();
  });

  it("resets dependency diagnostics state on reinitialize()", () => {
    mockDependenciesFeature(true);
    initializePlugin();

    expect(PLUGIN_MONITOR.isDependencyDiagnosticsEnabled).toBe(true);

    reinitialize();

    expect(PLUGIN_MONITOR.isDependencyDiagnosticsEnabled).toBe(false);
    expect(PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()).toBeNull();
  });
});
