import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  settingValues?: Record<string, any>;
}

export const defaultSetupOpts: SetupOpts = {
  hasEnterprisePlugins: false,
  tokenFeatures: {},
  settingValues: {},
};

export function setup({
  hasEnterprisePlugins = defaultSetupOpts.hasEnterprisePlugins,
  tokenFeatures = defaultSetupOpts.tokenFeatures,
  settingValues = defaultSetupOpts.settingValues,
}: SetupOpts = defaultSetupOpts) {
  const settings = mockSettings({
    "show-sdk-embed-terms": true,
    "enable-embedding-iframe-sdk": false,
    ...settingValues,
  });

  const state = createMockState({
    settings,
  });

  const mockTokenFeatures = createMockTokenFeatures(tokenFeatures);

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupPropertiesEndpoints(
    createMockSettings({
      "token-features": mockTokenFeatures,
    }),
  );

  return {
    state,
  };
}
