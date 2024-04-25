/* istanbul ignore file */
import { IndexRedirect, Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  SettingDefinition,
  Settings,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import SettingsEditor from "../SettingsEditor";

export const FULL_APP_EMBEDDING_URL =
  "/admin/settings/embedding-in-other-applications/full-app";
export const EMAIL_URL = "/admin/settings/email";

export interface SetupOpts {
  initialRoute?: string;
  currentUser?: User;
  settings?: SettingDefinition[];
  settingValues?: Settings;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = async ({
  initialRoute = "/admin/settings",
  currentUser = createMockUser({ is_superuser: true }),
  settings = [
    createMockSettingDefinition({
      key: "token-features",
      value: createMockTokenFeatures(),
    }),
  ],
  settingValues = createMockSettings(),
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) => {
  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupApiKeyEndpoints([]);
  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValuesWithToken);

  const { history } = renderWithProviders(
    <Route path="/admin/settings">
      <IndexRedirect to="general" />
      <Route path="*" component={SettingsEditor} />
    </Route>,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute,
    },
  );

  await waitFor(() => screen.getByText(/general/i));

  return { history };
};
