/* istanbul ignore file */
import { IndexRedirect, Route } from "react-router";
import { SettingDefinition, Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
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
  settings?: SettingDefinition[];
  settingValues?: Settings;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  initialRoute = "/admin/settings",
  settings = [],
  settingValues = createMockSettings(),
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      ...settingValues,
      "token-features": tokenFeatures,
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValues);

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
