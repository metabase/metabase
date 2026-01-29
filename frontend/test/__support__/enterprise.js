import { initializePlugins } from "metabase-enterprise/plugins";

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
  initializePlugins?.();
}

/**
 * Import only the specified enterprise-only plugin and initialize it.
 *
 * Disclaimer: this can lead to unexpected behavior if the plugin being initialized
 * has dependencies on other enterprise plugins that are not initialized.
 *
 * You can resort to using `setupEnterprisePlugins` instead to initialize all enterprise plugins.
 *
 * @see https://github.com/metabase/metabase/blob/da3cad00d3dafe3ce7d14d112f115ec5d7fce8a9/plugin_dependencies.md
 *
 * @param {import("./enterprise-typed").ENTERPRISE_PLUGIN_NAME} pluginName
 */
export function setupEnterpriseOnlyPlugin(pluginName) {
  const { initializePlugin } = require(
    ENTERPRISE_PLUGIN_NAME_MAPPING[pluginName],
  );
  initializePlugin?.();
}
