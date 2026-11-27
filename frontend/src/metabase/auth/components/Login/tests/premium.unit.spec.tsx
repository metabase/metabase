import "metabase/auth/plugins";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("Login", () => {
  it("should disable password login with the 'disable_password_login' token feature", () => {
    setup({
      isPasswordLoginEnabled: false,
      isGoogleAuthEnabled: true,
      enterprisePlugins: ["auth"],
      tokenFeatures: { disable_password_login: true },
    });

    expect(screen.queryByText("Sign in with email")).not.toBeInTheDocument();
  });

  it("keeps the login form while LDAP is enabled, even with password login off (metabase#25661)", () => {
    setup({
      isPasswordLoginEnabled: false,
      isLdapEnabled: true,
      enterprisePlugins: ["auth"],
      tokenFeatures: { disable_password_login: true },
    });

    expect(
      screen.getByLabelText("Username or email address"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
