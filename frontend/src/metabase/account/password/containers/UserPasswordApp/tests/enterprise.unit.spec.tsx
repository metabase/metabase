import { screen, waitFor, waitForLoaderToBeRemoved } from "__support__/ui";
import { createMockMfaStatus, createMockUser } from "metabase-types/api/mocks";

import { type SetupOpts, setup as setupCommon } from "./setup";

function setup(options: SetupOpts = {}) {
  return setupCommon({
    hasMfaPlugin: true,
    hasAuthPlugin: true,
    tokenFeatures: { "multi-factor-auth": true, disable_password_login: true },
    ...options,
  });
}

describe("UserPasswordApp (EE)", () => {
  it("should show two-factor authentication settings alongside the password form", async () => {
    setup();

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });

  it("should not show two-factor authentication settings when the instance has it off", async () => {
    setup({
      mfaStatus: createMockMfaStatus({ mfa_enabled: false, enrolled: true }),
    });

    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByText("Two-factor authentication"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });

  it("should show only two-factor authentication settings for an LDAP user", async () => {
    setup({
      user: createMockUser({ sso_source: "ldap" }),
    });

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("should keep the MFA settings after an LDAP user disconnects Slack", async () => {
    const user = createMockUser({
      sso_source: "ldap",
      slack_account_status: "active",
    });
    const { router, disconnect } = setup({
      user,
    });

    await screen.findByText("Two-factor authentication");
    await disconnect();
    await screen.findByText("Your Slack account has been disconnected.");

    expect(screen.getByText("Two-factor authentication")).toBeInTheDocument();
    expect(screen.queryByText("Slack")).not.toBeInTheDocument();
    expect(router?.location.pathname).toBe("/account/authentication");
  });

  it("should go to Profile after an OIDC user disconnects with password login and MFA disabled", async () => {
    const user = createMockUser({
      sso_source: "oidc",
      slack_account_status: "active",
    });
    const { router, disconnect } = setup({
      user,
      mfaStatus: createMockMfaStatus({ mfa_enabled: false }),
      isPasswordLoginEnabled: false,
    });

    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    await disconnect();

    expect(
      await screen.findByText("Your Slack account has been disconnected."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(router?.location.pathname).toBe("/account/profile"),
    );
  });

  it("should show the Slack row for an SSO user", async () => {
    setup({
      user: createMockUser({
        sso_source: "google",
        slack_account_status: "active",
      }),
    });

    expect(await screen.findByText("Slack")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });
});
