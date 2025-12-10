import { ENTERPRISE_PLUGIN_NAME_MAPPING } from "./enterprise-typed";

/**
 * @deprecated use setupEnterprisePlugins with settings set via mockSettings
 * ```ts
 * import { createMockState } from "metabase-types/store/mocks";
 * import { mockSettings } from "__support__/settings";
 * import {
 *   createMockTokenFeatures,
 * } from "metabase-types/api/mocks";
 *
 * const state = createMockState({
 *   settings: mockSettings({
 *     "token-features": createMockTokenFeatures(tokenFeatures),
 *   }),
 * });
 *
 * if (hasEnterprisePlugins) {
 *   setupEnterprisePlugins();
 * }
 *
 * renderWithProviders(
 *   <SomeComponent />,
 *   {
 *     storeInitialState: state,
 *   },
 * );
 * ```
 */
export function setupEnterpriseTest() {
  jest.mock("metabase-enterprise/settings", () => ({
    hasPremiumFeature: jest.fn().mockReturnValue(true),
  }));

  setupEnterprisePlugins();
}

export function setupEnterprisePlugins() {
  const { initializePlugins } = require(`metabase-enterprise/plugins`);
  initializePlugins?.();
}

// function is used for optimization, so we don't need to import all plugins
/**
 *
 * @param {import("./enterprise-typed").ENTERPRISE_PLUGIN_NAME} pluginName
 */
export function setupEnterpriseOnlyPlugin(pluginName) {
  const { initializePlugin } = require(
    ENTERPRISE_PLUGIN_NAME_MAPPING[pluginName],
  );
  initializePlugin?.();
}
