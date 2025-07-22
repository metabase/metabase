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
}

export function setup({
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  const settings = mockSettings({
    "show-sdk-embed-terms": true,
    "enable-embedding-iframe-sdk": false,
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
