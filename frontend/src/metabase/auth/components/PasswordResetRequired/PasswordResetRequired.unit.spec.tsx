import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForgotPasswordEndpoint } from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";

import { PasswordResetRequired } from "./PasswordResetRequired";

const TEST_EMAIL = "user@example.test";

interface SetupOpts {
  isEmailConfigured?: boolean;
}

const setup = ({ isEmailConfigured = true }: SetupOpts = {}) => {
  setupForgotPasswordEndpoint();
  const onCancel = jest.fn<void, []>();
  renderWithProviders(
    <PasswordResetRequired email={TEST_EMAIL} onCancel={onCancel} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState({
          "email-configured?": isEmailConfigured,
          "ldap-enabled": false,
        }),
      }),
    },
  );
  return { onCancel };
};

describe("PasswordResetRequired", () => {
  it("explains that an administrator requires a new password", () => {
    setup();

    expect(
      screen.getByText("You need to set a new password"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/An administrator has required you/),
    ).toBeInTheDocument();
  });

  it("emails a reset link to the user on request", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Email me a reset link" }),
    );

    expect(
      await screen.findByText(/We've sent a link to user@example.test/),
    ).toBeInTheDocument();
    const calls = fetchMock.callHistory.calls(
      "path:/api/session/forgot_password",
    );
    expect(calls).toHaveLength(1);
    const body: unknown = JSON.parse(String(calls[0].options.body));
    expect(body).toEqual({ email: TEST_EMAIL });
    expect(
      screen.queryByRole("button", { name: "Email me a reset link" }),
    ).not.toBeInTheDocument();
  });

  it("tells the user to ask an administrator when email is not set up", () => {
    setup({ isEmailConfigured: false });

    expect(
      screen.getByText(/Ask an administrator to share a password reset link/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Email me a reset link" }),
    ).not.toBeInTheDocument();
  });

  it("goes back to sign in", async () => {
    const { onCancel } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Back to sign in" }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
