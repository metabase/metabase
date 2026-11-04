import { screen } from "__support__/ui";
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

  it.each(["google", "jwt", "saml", "ldap"] as const)(
    "should show only language field for %s user who has password",
    (ssoSource) => {
      setup({
        user: createMockUser({ sso_source: ssoSource, has_password: true }),
      });

      expect(screen.queryByText(/first name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/last name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
      expect(screen.getByText(/language/i)).toBeInTheDocument();
    },
  );
});
