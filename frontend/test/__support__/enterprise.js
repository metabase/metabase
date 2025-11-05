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
  require("metabase-enterprise/plugins");
}

// function is used for optimization, so we don't need to import all plugins
export function setupEnterpriseOnlyPlugin(pluginName) {
  require(`metabase-enterprise/${pluginName}`);
}
