import { PLUGIN_MONITOR_RELAY, reinitialize } from "metabase/plugins";
import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = jest.mocked(hasPremiumFeature);

describe("metabase-enterprise/monitor_relay initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("enables the settings page with its token feature", () => {
    mockHasPremiumFeature.mockImplementation(
      (feature) => feature === "monitor_relay",
    );

    initializePlugin();

    expect(PLUGIN_MONITOR_RELAY.isEnabled).toBe(true);
    expect(PLUGIN_MONITOR_RELAY.settingsPage).not.toBe(pluginPlaceholderRoute);
  });

  it("leaves the OSS defaults without its token feature", () => {
    mockHasPremiumFeature.mockImplementation(
      (feature) => feature !== "monitor_relay",
    );

    initializePlugin();

    expect(PLUGIN_MONITOR_RELAY.isEnabled).toBe(false);
    expect(PLUGIN_MONITOR_RELAY.settingsPage).toBe(pluginPlaceholderRoute);
  });
});
