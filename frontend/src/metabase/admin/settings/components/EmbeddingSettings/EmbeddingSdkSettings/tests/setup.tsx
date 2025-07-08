import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingSdkSettings } from "../EmbeddingSdkSettings";

export interface SetupOpts {
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingSdkEnabled?: Settings["enable-embedding-sdk"];
  isHosted?: Settings["is-hosted?"];
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export async function setup({
  showSdkEmbedTerms = true,
  isEmbeddingSdkEnabled = false,
  isHosted = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "show-sdk-embed-terms": showSdkEmbedTerms,
    "enable-embedding-sdk": isEmbeddingSdkEnabled,
    "is-hosted?": isHosted,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  const state = createMockState({
    settings: mockSettings(settings),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUpdateSettingsEndpoint();
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(<EmbeddingSdkSettings />, {
    storeInitialState: state,
  });

  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(3);
  });

  await screen.findByText("Embedding SDK");
}
