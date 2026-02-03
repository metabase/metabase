import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  initialRoute = "/auth/login",
  isPasswordLoginEnabled = true,
  isGoogleAuthEnabled = false,
  enterprisePlugins,
  tokenFeatures = {},
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "google-auth-enabled": isGoogleAuthEnabled,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <>
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/login/:provider" component={Login} />
    </>,
    { storeInitialState: state, withRouter: true, initialRoute },
  );
};
