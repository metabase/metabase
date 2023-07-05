import { Route } from "react-router";
import { TokenFeatures } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import SettingsEditor from "../SettingsEditor";

export interface SetupOpts {
  initialRoute?: string;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  initialRoute = "/admin/settings/general",
  tokenFeatures,
  hasEnterprisePlugins,
}: SetupOpts) => {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route path="admin/settings">
      <Route path="*" component={SettingsEditor} />
    </Route>,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute,
    },
  );
};
