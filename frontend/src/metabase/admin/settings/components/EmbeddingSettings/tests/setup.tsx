import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupTokenStatusEndpoint,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { waitFor } from "__support__/ui";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  renderCallback: (data: { state: Partial<State> }) => void;
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingSdkEnabled?: Settings["enable-embedding-sdk"];
  isEmbeddingSimpleEnabled?: Settings["enable-embedding-simple"];
  isHosted?: Settings["is-hosted?"];
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

// SETTINGS OVERRIDES:
PLUGIN_IS_EE_BUILD.isEEBuild = () => true;

export async function setup({
  renderCallback,
  showSdkEmbedTerms = true,
  isEmbeddingSdkEnabled = false,
  isEmbeddingSimpleEnabled = false,
  isHosted = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
  specificPlugins,
}: SetupOpts) {
  const settings = createMockSettings({
    "show-sdk-embed-terms": showSdkEmbedTerms,
    "enable-embedding-sdk": isEmbeddingSdkEnabled,
    "enable-embedding-simple": isEmbeddingSimpleEnabled,
    "is-hosted?": isHosted,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  const state = createMockState({
    settings: mockSettings(settings),
  });

  if (hasEnterprisePlugins) {
    if (specificPlugins) {
      specificPlugins.forEach((plugin) => {
        setupEnterpriseOnlyPlugin(plugin);
      });
    } else {
      setupEnterprisePlugins();
    }
    setupTokenStatusEndpoint({ valid: true });
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
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-embedded-analytics-js",
    value: true,
  });

  renderCallback({ state });

  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining("/api/setting"),
        }),
        expect.objectContaining({
          url: expect.stringContaining("/api/session/properties"),
        }),
      ]),
    );
  });
}
