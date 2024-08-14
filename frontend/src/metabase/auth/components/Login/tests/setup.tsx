import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Login } from "../Login";

interface SetupOpts {
  initialRoute?: string;
  isPasswordLoginEnabled?: boolean;
  isGoogleAuthEnabled?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  initialRoute = "/auth/login",
  isPasswordLoginEnabled = true,
  isGoogleAuthEnabled = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "google-auth-enabled": isGoogleAuthEnabled,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <>
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/login/:provider" component={Login} />
    </>,
    { storeInitialState: state, withRouter: true, initialRoute },
  );
};
