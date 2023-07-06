import { Route } from "react-router";
import { renderWithProviders } from "__support__/ui";
import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp";
import { createMockAdminState } from "metabase-types/store/mocks";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockSettings } from "__support__/settings";
import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";

export const setup = ({
  initialRoute,
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}) => {
  setupGroupsEndpoint([createMockGroup()]);
  setupPropertiesEndpoints(
    createMockSettings({ "token-features": tokenFeatures }),
  );
  const settings = mockSettings({ "token-features": tokenFeatures });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route path="/admin/settings/*" component={SettingsEditorApp} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        settings,
        currentUser: createMockUser({ is_superuser: true }),
        admin: createMockAdminState({
          settings: {
            settings: [
              createMockSettingDefinition({
                key: "token-features",
                value: tokenFeatures,
              }),
            ],
          },
        }),
      },
    },
  );
};
