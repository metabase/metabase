import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupForgotPasswordEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { ForgotPassword } from "./ForgotPassword";

const TEST_EMAIL = "user@metabase.test";

interface SetupOpts {
  isEmailConfigured?: boolean;
  isLdapEnabled?: boolean;
}

const setup = ({ isEmailConfigured, isLdapEnabled }: SetupOpts) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "email-configured?": isEmailConfigured,
      "ldap-enabled": isLdapEnabled,
    }),
  });

  setupForgotPasswordEndpoint();

  renderWithProviders(
    <Route path="/auth/forgot_password" component={ForgotPassword} />,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute: "/auth/forgot_password",
    },
  );
};

describe("ForgotPassword", () => {
  it("should show a form when the user can reset their password", () => {
    setup({ isEmailConfigured: true });

    expect(screen.getByText("Forgot password")).toBeInTheDocument();
  });

  it("should show a success message when the form is submitted", async () => {
    setup({ isEmailConfigured: true });
    await userEvent.type(screen.getByLabelText("Email address"), TEST_EMAIL);
    await waitFor(() => {
      expect(screen.getByText("Send password reset email")).toBeEnabled();
    });

    await userEvent.click(screen.getByText("Send password reset email"));
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("should show an error message when the user cannot reset their password", () => {
    setup({ isEmailConfigured: false });

    expect(screen.getByText(/contact an administrator/)).toBeInTheDocument();
  });
});
