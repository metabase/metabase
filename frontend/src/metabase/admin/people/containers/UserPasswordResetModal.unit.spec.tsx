import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForgotPasswordEndpoint } from "__support__/server-mocks/session";
import {
  setupPasswordResetUrlEndpoint,
  setupUpdatePasswordEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks/user";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, User } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { UserPasswordResetModal } from "./UserPasswordResetModal";

const TEST_USER = createMockUser({
  id: 42,
  first_name: "Ash",
  last_name: "Ketchum",
  email: "ash@example.com",
  common_name: "Ash Ketchum",
});

interface SetupOpts {
  user?: User;
  emailConfigured?: boolean;
  settings?: Partial<EnterpriseSettings>;
}

function setup({
  user = TEST_USER,
  emailConfigured = false,
  settings = {},
}: SetupOpts = {}) {
  setupUserEndpoints(user);
  setupPasswordResetUrlEndpoint(user.id);
  setupForgotPasswordEndpoint();
  setupUpdatePasswordEndpoint(user.id);

  const storeInitialState = createMockState({
    settings: mockSettings(
      createMockSettings({
        "email-configured?": emailConfigured,
        ...settings,
      }),
    ),
  });

  const onCloseSpy = jest.fn<void, []>();
  renderWithProviders(
    <UserPasswordResetModal
      params={{ userId: String(user.id) }}
      onClose={onCloseSpy}
    />,
    { storeInitialState },
  );
  return { onCloseSpy };
}

describe("UserPasswordResetModal", () => {
  it("should render the confirmation dialog with 'Get reset link' button", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Get reset link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset password" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("should show reset URL after clicking 'Get reset link'", async () => {
    setup();
    await screen.findByRole("button", { name: "Get reset link" });

    await userEvent.click(
      screen.getByRole("button", { name: "Get reset link" }),
    );

    expect(
      await screen.findByText(
        "Share this link with the user. It will expire in 48 hours.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall(
      `path:/api/user/${TEST_USER.id}/password-reset-url`,
      { method: "POST" },
    );
    expect(call).toBeTruthy();
  });

  it("should call onClose when clicking Done after getting reset link", async () => {
    const { onCloseSpy } = setup();
    await screen.findByRole("button", { name: "Get reset link" });

    await userEvent.click(
      screen.getByRole("button", { name: "Get reset link" }),
    );
    await screen.findByText(
      "Share this link with the user. It will expire in 48 hours.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCloseSpy).toHaveBeenCalled();
  });

  describe("for a user who signs in with SSO", () => {
    const ssoUser = createMockUser({
      ...TEST_USER,
      sso_source: "saml",
    });

    it("should explain that the password can't be reset while their provider is enabled", async () => {
      const { onCloseSpy } = setup({
        user: ssoUser,
        settings: { "saml-enabled": true },
      });

      expect(
        await screen.findByText("Can't reset Ash Ketchum's password"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Get reset link" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reset password" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
      expect(
        fetchMock.callHistory.called(
          `path:/api/user/${ssoUser.id}/password-reset-url`,
        ),
      ).toBe(false);
    });

    it("should allow resetting the password once their provider is disabled", async () => {
      setup({ user: ssoUser, settings: { "saml-enabled": false } });

      expect(
        await screen.findByRole("button", { name: "Get reset link" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reset password" }),
      ).toBeInTheDocument();
    });
  });
});
