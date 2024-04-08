import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockSettingDefinition,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { EmbedHomepage } from "../EmbedHomepage";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  settings?: Partial<Settings>;
}

export async function setup({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
  settings = {},
}: SetupOpts = {}) {
  jest.clearAllMocks();

  fetchMock.put("path:/api/setting/embedding-homepage", 200);
  setupSettingsEndpoints([createMockSettingDefinition()]);
  setupPropertiesEndpoints(createMockSettings());

  const state = createMockState({
    settings: createMockSettingsState({
      "token-features": createMockTokenFeatures(tokenFeatures),
      ...settings,
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<EmbedHomepage />, { storeInitialState: state });
}
