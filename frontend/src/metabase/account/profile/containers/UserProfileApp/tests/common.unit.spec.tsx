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

  it.each(["ldap", "google", "jwt", "saml"] as const)(
    "should show only the language field for a %s user (metabase#23298)",
    (ssoSource) => {
      setup({ user: createMockUser({ sso_source: ssoSource }) });

      expect(screen.getByText(/language/i)).toBeInTheDocument();
      expect(screen.queryByText(/first name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/last name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    },
  );
});
