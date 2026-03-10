import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { EmbedHomepage } from "../EmbedHomepage";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  settings?: Partial<Settings>;
  isAdmin?: boolean;
}

export async function setup({
  tokenFeatures = createMockTokenFeatures(),
  enterprisePlugins,
  settings = {},
  isAdmin = false,
}: SetupOpts = {}) {
  jest.clearAllMocks();

  fetchMock.put("path:/api/setting/embedding-homepage", 200);
  fetchMock.post("path:/api/product-feedback", 200);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(createMockSettings());

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: createMockSettingsState({
      "token-features": createMockTokenFeatures(tokenFeatures),
      ...settings,
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
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
  fetchMock.callHistory.lastCall("path:/api/setting/embedding-homepage", {
    method: "PUT",
  });

export const getLastFeedbackCall = () =>
  fetchMock.callHistory.lastCall("path:/api/product-feedback", {
    method: "POST",
  });

export const queryFeedbackModal = () =>
  screen.queryByText("How can we improve embedding?");
