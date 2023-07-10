/* istanbul ignore file */
import { IndexRedirect, Route } from "react-router";
import {
  SettingDefinition,
  Settings,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import SettingsEditor from "../SettingsEditor";

export interface SetupOpts {
  initialRoute?: string;
  currentUser?: User;
  definitions?: SettingDefinition[];
  settingValues?: Settings;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  initialRoute = "/admin/settings",
  currentUser = createMockUser({ is_superuser: true }),
  definitions = [],
  settingValues = createMockSettings(),
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    ...settingValues,
    "token-features": tokenFeatures,
  });
  const state = createMockState({
    settings: mockSettings(settings),
    currentUser,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupSettingsEndpoints(definitions);
  setupPropertiesEndpoints(settings);

  renderWithProviders(
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
};
