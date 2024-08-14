import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("UserProfileApp (EE with token)", () => {
  it("should show only show language field for an SSO user", () => {
    setup({
      isPasswordLoginEnabled: false,
      hasEnterprisePlugins: true,
      tokenFeatures: { disable_password_login: true },
    });

    expect(screen.queryByText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/language/i)).toBeInTheDocument();
  });
});
