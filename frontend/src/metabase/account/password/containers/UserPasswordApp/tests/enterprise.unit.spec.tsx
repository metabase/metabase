import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { createMockMfaStatus, createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("UserPasswordApp (EE)", () => {
  it("should show two-factor authentication settings alongside the password form", async () => {
    setup({
      hasMfaPlugin: true,
      tokenFeatures: { "multi-factor-auth": true },
    });

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });

  it("should not show two-factor authentication settings when the instance has it off", async () => {
    setup({
      hasMfaPlugin: true,
      mfaStatus: createMockMfaStatus({ mfa_enabled: false, enrolled: true }),
      tokenFeatures: { "multi-factor-auth": true },
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
      hasMfaPlugin: true,
      tokenFeatures: { "multi-factor-auth": true },
    });

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });
});
