import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";

import { Login } from "../Login";

interface SetupOpts {
  initialRoute?: string;
  isPasswordLoginEnabled?: boolean;
  isGoogleAuthEnabled?: boolean;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  initialRoute = "/auth/login",
  isPasswordLoginEnabled = true,
  isGoogleAuthEnabled = false,
  enterprisePlugins,
  tokenFeatures = {},
}: SetupOpts = {}) => {
  const { render } = createScenario()
    .withSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "google-auth-enabled": isGoogleAuthEnabled,
    })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(
    <>
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/login/:provider" component={Login} />
    </>,
    { withRouter: true, initialRoute },
  );
};
