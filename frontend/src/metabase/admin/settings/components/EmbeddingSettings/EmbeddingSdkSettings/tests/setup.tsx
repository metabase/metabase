import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingSdkSettings } from "../EmbeddingSdkSettings";

export interface SetupOpts {
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingSdkEnabled?: Settings["enable-embedding-sdk"];
  isHosted?: Settings["is-hosted?"];
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export function setup({
  showSdkEmbedTerms = true,
  isEmbeddingSdkEnabled = false,
  isHosted = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "show-sdk-embed-terms": showSdkEmbedTerms,
      "enable-embedding-sdk": isEmbeddingSdkEnabled,
      "is-hosted?": isHosted,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const updateSetting = jest.fn();
  renderWithProviders(<EmbeddingSdkSettings updateSetting={updateSetting} />, {
    storeInitialState: state,
  });

  return {
    updateSetting,
  };
}
