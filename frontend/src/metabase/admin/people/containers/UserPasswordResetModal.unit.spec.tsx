import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForgotPasswordEndpoint } from "__support__/server-mocks/session";
import {
  setupForcePasswordResetEndpoint,
  setupPasswordResetUrlEndpoint,
  setupUpdatePasswordEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks/user";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { redirect } from "metabase/utils/dom";
import type { EnterpriseSettings, User } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { UserPasswordResetModal } from "./UserPasswordResetModal";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  redirect: jest.fn(),
}));

const TEST_USER = createMockUser({
  id: 42,
  first_name: "Ash",
  last_name: "Ketchum",
  email: "ash@example.com",
  common_name: "Ash Ketchum",
});

interface SetupOpts {
  user?: User;
  currentUser?: User;
  emailConfigured?: boolean;
  settings?: Partial<EnterpriseSettings>;
}

function setup({
  user = TEST_USER,
  currentUser = createMockUser({ id: 1, is_superuser: true }),
  emailConfigured = false,
  settings = {},
}: SetupOpts = {}) {
  jest.mocked(redirect).mockClear();
  setupUserEndpoints(user);
  setupPasswordResetUrlEndpoint(user.id);
  setupForgotPasswordEndpoint();
  setupUpdatePasswordEndpoint(user.id);
  setupForcePasswordResetEndpoint({ users_reset: 1, emails_queued: 1 });

  const storeInitialState = createMockState({
    currentUser,
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

const FORCE_RESET_PATH = "path:/api/user/force-password-reset";
const RESET_URL_PATH = `path:/api/user/${TEST_USER.id}/password-reset-url`;
const FORGOT_PASSWORD_PATH = "path:/api/session/forgot_password";

const forceResetBodies = (): unknown[] =>
  fetchMock.callHistory
    .calls(FORCE_RESET_PATH)
    .map((call): unknown => JSON.parse(String(call.options.body)));

describe("UserPasswordResetModal", () => {
  it("should offer to log the user out and block their current password, unchecked by default", async () => {
    setup();

    expect(
      await screen.findByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Get reset link" }),
    ).toBeEnabled();
  });

  it("should disable getting a reset link while the checkbox is checked", async () => {
    setup();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Log them out and block their current password",
    });

    await userEvent.click(checkbox);
    expect(
      screen.getByRole("button", { name: "Get reset link" }),
    ).toBeDisabled();

    await userEvent.click(checkbox);
    expect(
      screen.getByRole("button", { name: "Get reset link" }),
    ).toBeEnabled();
  });

  it("should only get a reset link, without locking the user out", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Get reset link" }),
    );

    expect(
      await screen.findByText(
        "Share this link with the user. It will expire in 48 hours.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called(RESET_URL_PATH)).toBe(true);
    expect(forceResetBodies()).toEqual([]);
  });

  it("should only allow resetting once the user's email is typed when checked", async () => {
    setup({ emailConfigured: true });
    const resetButton = await screen.findByRole("button", {
      name: "Reset password",
    });
    expect(resetButton).toBeEnabled();

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    );
    expect(resetButton).toBeDisabled();

    const confirmation = screen.getByRole("textbox", {
      name: `Type "${TEST_USER.email}" to confirm`,
    });
    await userEvent.type(confirmation, "ash@example");
    expect(resetButton).toBeDisabled();
    await userEvent.type(confirmation, ".com");
    expect(resetButton).toBeEnabled();

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    );
    expect(
      screen.queryByRole("textbox", { name: /to confirm/ }),
    ).not.toBeInTheDocument();
    expect(resetButton).toBeEnabled();
  });

  it("should lock the user out and email them a link when checked and email is set up", async () => {
    const { onCloseSpy } = setup({ emailConfigured: true });

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /to confirm/ }),
      TEST_USER.email,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" }),
    );

    await waitFor(() => expect(onCloseSpy).toHaveBeenCalledTimes(1));
    expect(forceResetBodies()).toEqual([{ user_ids: [TEST_USER.id] }]);
    expect(fetchMock.callHistory.called(FORGOT_PASSWORD_PATH)).toBe(false);
  });

  it("should send the current user to sign in after they lock themselves out", async () => {
    const { onCloseSpy } = setup({
      emailConfigured: true,
      currentUser: TEST_USER,
    });

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /to confirm/ }),
      TEST_USER.email,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" }),
    );

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/auth/login"));
    expect(forceResetBodies()).toEqual([{ user_ids: [TEST_USER.id] }]);
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it("should not send anyone to sign in after locking out someone else", async () => {
    const { onCloseSpy } = setup({ emailConfigured: true });

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Log them out and block their current password",
      }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /to confirm/ }),
      TEST_USER.email,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" }),
    );

    await waitFor(() => expect(onCloseSpy).toHaveBeenCalledTimes(1));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("should only email a link when unchecked and email is set up", async () => {
    const { onCloseSpy } = setup({ emailConfigured: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Reset password" }),
    );

    await waitFor(() => expect(onCloseSpy).toHaveBeenCalledTimes(1));
    expect(fetchMock.callHistory.called(FORGOT_PASSWORD_PATH)).toBe(true);
    expect(forceResetBodies()).toEqual([]);
  });

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
