import { Route } from "react-router";
import MetabaseSettings from "metabase/lib/settings";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Login } from "./Login";

interface SetupOpts {
  initialRoute?: string;
  isPasswordLoginEnabled?: boolean;
  isGoogleAuthEnabled?: boolean;
}

const setup = ({
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

const cleanUp = () => {
  MetabaseSettings.set("enable-password-login", true);
  MetabaseSettings.set("google-auth-enabled", false);
};

describe("Login", () => {
  afterEach(() => {
    cleanUp();
  });

  it("should render a list of auth providers", () => {
    setup({ isPasswordLoginEnabled: true, isGoogleAuthEnabled: true });

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("should render the panel of the selected provider", () => {
    setup({
      initialRoute: "/auth/login/password",
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: true,
    });

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should implicitly select the only provider with a panel", () => {
    setup({
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: false,
    });

    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
