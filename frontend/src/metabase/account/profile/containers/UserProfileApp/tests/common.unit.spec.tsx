import { screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("UserProfileApp (OSS)", () => {
  it("should show all form fields, even when password login is disabled", () => {
    setup({ isPasswordLoginEnabled: false });

    expect(screen.getByText(/first name/i)).toBeInTheDocument();
    expect(screen.getByText(/last name/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/language/i)).toBeInTheDocument();
  });

  it("should show the name and email fields for a password user (metabase#23298)", () => {
    setup({ user: createMockUser({ sso_source: null }) });

    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it.each(["ldap", "google", "jwt", "saml"] as const)(
    "should hide the name and email fields for a %s user (metabase#23298)",
    (ssoSource) => {
      setup({
        user: createMockUser({
          sso_source: ssoSource,
          slack_account_status: null,
        }),
      });

      expect(
        within(screen.getByTestId("user-locale-select")).getByLabelText(
          "Language",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    },
  );
});
