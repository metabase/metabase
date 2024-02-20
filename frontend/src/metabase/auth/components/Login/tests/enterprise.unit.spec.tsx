import "metabase/plugins/builtin";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("Login", () => {
  it("should not disable password login without the 'disable_password_login' token feature", () => {
    setup({
      isPasswordLoginEnabled: false,
      isGoogleAuthEnabled: true,
      hasEnterprisePlugins: true,
    });

    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
  });
});
