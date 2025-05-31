import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockState,
} from "metabase-types/store/mocks";

import { EmbeddingSdkOptionCard } from "../EmbeddingSdkOptionCard";

export interface SetupOpts {
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingSdkEnabled?: Settings["enable-embedding-sdk"];
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export function setup({
  showSdkEmbedTerms = true,
  isEmbeddingSdkEnabled = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  const settingValues = createMockSettings({
    "show-sdk-embed-terms": showSdkEmbedTerms,
    "enable-embedding-sdk": isEmbeddingSdkEnabled,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  const settingDefinitions = [
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: showSdkEmbedTerms,
    }),
    createMockSettingDefinition({
      key: "enable-embedding-sdk",
      value: isEmbeddingSdkEnabled,
    }),
  ];

  const state = createMockState({
    settings: mockSettings(settingValues),
    admin: createMockAdminState({
      settings: {
        settings: settingDefinitions,
        warnings: {},
      },
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupSettingsEndpoints(settingDefinitions);
  setupPropertiesEndpoints(settingValues);

  const updateSetting = jest.fn();
  renderWithProviders(
    <EmbeddingSdkOptionCard updateSetting={updateSetting} />,
    {
      storeInitialState: state,
    },
  );

  return {
    updateSetting,
  };
}
