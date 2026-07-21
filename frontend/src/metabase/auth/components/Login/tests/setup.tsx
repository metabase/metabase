import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route, withRouteProps } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { Login } from "../Login";

const RoutedLogin = withRouteProps(Login);

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
      <Route path="/auth/login" element={<RoutedLogin />} />
      <Route path="/auth/login/:provider" element={<RoutedLogin />} />
    </>,
    { storeInitialState: state, withRouter: true, initialRoute },
  );
};
