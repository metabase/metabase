import { activateEEPlugins } from "metabase-enterprise/plugins";

/**
 * @deprecated use setupEnterprisePlugins with settings set via mockSettings
 */
export function setupEnterpriseTest() {
  jest.mock("metabase-enterprise/settings", () => ({
    hasPremiumFeature: jest.fn().mockReturnValue(true),
  }));

  setupEnterprisePlugins();
}

export function setupEnterprisePlugins() {
  activateEEPlugins();
}
