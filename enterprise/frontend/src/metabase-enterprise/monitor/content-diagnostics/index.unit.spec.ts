import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getContentDiagnosticsRoutes } from "./routes";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

// jest.mock replaces the module factory; retype the import as its mock
const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const mockContentDiagnosticsFeature = (enabled: boolean) => {
  mockHasPremiumFeature.mockImplementation((feature) =>
    feature === "content_diagnostics" ? enabled : false,
  );
};

describe("metabase-enterprise/monitor/content-diagnostics initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("enables content diagnostics when the content_diagnostics feature is present", () => {
    mockContentDiagnosticsFeature(true);

    initializePlugin();

    expect(PLUGIN_MONITOR.isContentDiagnosticsEnabled).toBe(true);
    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes).toBe(
      getContentDiagnosticsRoutes,
    );
    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes()).not.toBeNull();
  });

  it("leaves the OSS defaults when the content_diagnostics feature is absent", () => {
    mockContentDiagnosticsFeature(false);

    initializePlugin();

    expect(PLUGIN_MONITOR.isContentDiagnosticsEnabled).toBe(false);
    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes()).toBeNull();
  });

  it("resets content diagnostics state on reinitialize()", () => {
    mockContentDiagnosticsFeature(true);
    initializePlugin();

    expect(PLUGIN_MONITOR.isContentDiagnosticsEnabled).toBe(true);

    reinitialize();

    expect(PLUGIN_MONITOR.isContentDiagnosticsEnabled).toBe(false);
    expect(PLUGIN_MONITOR.getContentDiagnosticsRoutes()).toBeNull();
  });
});
