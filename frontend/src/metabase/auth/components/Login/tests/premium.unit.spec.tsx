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
});
