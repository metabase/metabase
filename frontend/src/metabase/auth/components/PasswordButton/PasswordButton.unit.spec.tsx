import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PasswordButton } from "./PasswordButton";

interface SetupOpts {
  isLdapEnabled?: boolean;
}

const setup = ({ isLdapEnabled }: SetupOpts = {}) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "ldap-enabled": isLdapEnabled,
    }),
  });

  renderWithProviders(<PasswordButton />, { storeInitialState: state });
};

describe("PasswordButton", () => {
  it("should render the login button", () => {
    setup();
    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
  });

  it("should render the login button when ldap is enabled", () => {
    setup({ isLdapEnabled: true });
    expect(
      screen.getByText("Sign in with username or email"),
    ).toBeInTheDocument();
  });
});
