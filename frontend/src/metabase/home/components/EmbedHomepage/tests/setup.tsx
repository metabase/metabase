import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { screen, renderWithProviders } from "__support__/ui";
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
  fetchMock.post("path:/api/util/product-feedback", 200);
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

  renderWithProviders(
    <Route path="/" component={EmbedHomepage} />,

    {
      storeInitialState: state,
      withRouter: true,
      withUndos: true,
    },
  );
}

export const getLastHomepageSettingSettingCall = () =>
  fetchMock.lastCall("path:/api/setting/embedding-homepage", {
    method: "PUT",
  });

export const getLastFeedbackCall = () =>
  fetchMock.lastCall("path:/api/util/product-feedback", {
    method: "POST",
  });

export const queryFeedbackModal = () =>
  screen.queryByText("How can we improve embedding?");
