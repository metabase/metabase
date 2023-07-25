import { Route } from "react-router";

import MetabaseSettings from "metabase/lib/settings";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders } from "__support__/ui";

import { Login } from "../Login";

interface SetupOpts {
  initialRoute?: string;
  isPasswordLoginEnabled?: boolean;
  isGoogleAuthEnabled?: boolean;
}

export const setup = ({
  initialRoute = "/auth/login",
  isPasswordLoginEnabled = true,
  isGoogleAuthEnabled = false,
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "enable-password-login": isPasswordLoginEnabled,
      "google-auth-enabled": isGoogleAuthEnabled,
    }),
  });

  MetabaseSettings.set("enable-password-login", isPasswordLoginEnabled);
  MetabaseSettings.set("google-auth-enabled", isGoogleAuthEnabled);

  renderWithProviders(
    <>
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/login/:provider" component={Login} />
    </>,
    { storeInitialState: state, withRouter: true, initialRoute },
  );
};

export const cleanUp = () => {
  MetabaseSettings.set("enable-password-login", true);
  MetabaseSettings.set("google-auth-enabled", false);
};
