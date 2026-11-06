import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { createMockMfaStatus, createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("UserPasswordApp (OSS)", () => {
  it("should show the password form", () => {
    setup();

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("Create a password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm your password")).toBeInTheDocument();
  });

  it.each(["google", "jwt", "saml", "ldap"] as const)(
    "should show password form for %s user who has used password",
    (ssoSource) => {
      setup({
        user: createMockUser({
          sso_source: ssoSource,
          has_used_password: true,
        }),
      });

      expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    },
  );

  it.each(["google", "jwt", "saml", "ldap"] as const)(
    "should hide password form for %s user without used password",
    (ssoSource) => {
      setup({
        user: createMockUser({
          sso_source: ssoSource,
          has_used_password: false,
        }),
      });

      expect(
        screen.queryByLabelText("Current password"),
      ).not.toBeInTheDocument();
    },
  );

  it("should not show two-factor authentication settings, even when the instance has it on", async () => {
    setup({ mfaStatus: createMockMfaStatus({ mfa_enabled: true }) });

    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByText("Two-factor authentication"),
    ).not.toBeInTheDocument();
  });
});
