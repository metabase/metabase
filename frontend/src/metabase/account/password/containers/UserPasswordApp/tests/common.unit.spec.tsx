import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockMfaStatus, createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("UserPasswordApp (OSS)", () => {
  it("should hide Slack settings for a user without a Slack account", () => {
    setup({ user: createMockUser({ slack_account_status: null }) });

    expect(screen.queryByText("Slack")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disconnect" }),
    ).not.toBeInTheDocument();
  });

  it("should disconnect a Slack account and refresh the user", async () => {
    const user = createMockUser({
      slack_account_status: "active",
    });
    const { router, disconnect } = setup({
      user,
      disconnectResponse: { delay: 50 },
    });

    expect(screen.getByText("Slack")).toBeInTheDocument();
    await disconnect();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();

    await waitFor(() =>
      expect(screen.queryByText("Slack")).not.toBeInTheDocument(),
    );
    expect(
      fetchMock.callHistory.called(`path:/api/user/${user.id}/slack`, {
        method: "DELETE",
      }),
    ).toBe(true);
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/account/authentication");
  });

  it("should keep the Slack account when the confirmation is cancelled", async () => {
    const user = createMockUser({ slack_account_status: "active" });
    const { openDisconnectDialog } = setup({ user });

    await userEvent.click(
      within(await openDisconnectDialog()).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(`path:/api/user/${user.id}/slack`, {
        method: "DELETE",
      }),
    ).toBe(false);
  });

  it("should show an inactive link that can still be disconnected", () => {
    setup({ user: createMockUser({ slack_account_status: "inactive" }) });

    expect(
      screen.getByText("Your Slack connection is no longer active."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Your Slack account is connected/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeEnabled();
  });

  it.each(["google", "ldap", "jwt"] as const)(
    "should confirm disconnecting and go to Profile when a %s user's Authentication page becomes empty",
    async (ssoSource) => {
      const user = createMockUser({
        sso_source: ssoSource,
        slack_account_status: "active",
      });
      const { router, disconnect } = setup({
        user,
        mfaStatus: createMockMfaStatus({ mfa_enabled: false }),
      });

      await disconnect();

      expect(
        await screen.findByText("Your Slack account has been disconnected."),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(router?.location.pathname).toBe("/account/profile"),
      );
    },
  );

  it("should keep the Slack account and show an error when disconnecting fails", async () => {
    const user = createMockUser({ slack_account_status: "active" });
    const { disconnect } = setup({
      user,
      disconnectResponse: {
        status: 500,
        body: { message: "Could not disconnect Slack" },
      },
    });

    await disconnect();

    expect(
      await screen.findByText("Could not disconnect Slack"),
    ).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeEnabled();
  });

  it("should explain a failed refresh without showing a success toast", async () => {
    const { disconnect } = setup({
      user: createMockUser({ slack_account_status: "active" }),
      currentUserStatus: 500,
    });

    await disconnect();

    expect(
      await screen.findByText(
        "Couldn't refresh your account settings. Please reload the page.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Your Slack account has been disconnected."),
    ).not.toBeInTheDocument();
  });

  it("should show the password form", () => {
    setup();

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("Create a password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm your password")).toBeInTheDocument();
  });

  it("should not show two-factor authentication settings, even when the instance has it on", async () => {
    setup({ mfaStatus: createMockMfaStatus({ mfa_enabled: true }) });

    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByText("Two-factor authentication"),
    ).not.toBeInTheDocument();
  });
});
