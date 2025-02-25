import { EE_PLUGINS_SYSTEM } from "metabase/plugins";

/**
 * @deprecated use setupEnterprisePlugins with settings set via mockSettings
 */
export function setupEnterpriseTest() {
  jest.mock("metabase-enterprise/settings", () => ({
    hasPremiumFeature: jest.fn().mockReturnValue(true),
  }));

  setupEnterprisePlugins();
}

export function setupEnterprisePlugins(isEnterpriseBuild = true) {
  if (isEnterpriseBuild) {
    require("metabase-enterprise/plugins").activatePluginsSystem();
  } else {
    require("metabase/lib/noop").activatePluginsSystem();
  }
  EE_PLUGINS_SYSTEM.calculatePlugins();
}
