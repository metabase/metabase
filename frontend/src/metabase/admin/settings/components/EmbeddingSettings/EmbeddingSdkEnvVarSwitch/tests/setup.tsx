import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingSdkEnvVarSwitch } from "../EmbeddingSdkEnvVarSwitch";

export interface SetupOpts {
  hasEnterprisePlugins?: boolean;
  hasEmbeddingTokenFeature?: boolean;
  isEmbeddingSdkEnabled?: boolean;
  showSdkEmbedTerms?: boolean;
}

export const setup = ({
  hasEnterprisePlugins = false,
  hasEmbeddingTokenFeature = false,
  isEmbeddingSdkEnabled = false,
  showSdkEmbedTerms = false,
}: SetupOpts = {}) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: hasEmbeddingTokenFeature,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-embedding-sdk": isEmbeddingSdkEnabled,
    "show-sdk-embed-terms": showSdkEmbedTerms,
  });

  const state = createMockState({
    settings: mockSettings(settingValues),
  });

  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: showSdkEmbedTerms,
    }),
    createMockSettingDefinition({
      key: "enable-embedding-sdk",
      value: isEmbeddingSdkEnabled,
    }),
  ]);
  fetchMock.put("path:/api/setting/show-sdk-embed-terms", 200);
  fetchMock.put("path:/api/setting/enable-embedding-sdk", 200);
  setupPropertiesEndpoints(settingValues);

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const updateSettingMock = jest.fn();
  renderWithProviders(
    <EmbeddingSdkEnvVarSwitch updateSetting={updateSettingMock} />,
    {
      storeInitialState: state,
    },
  );

  return {
    updateSettingMock,
  };
};
