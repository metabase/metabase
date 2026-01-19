import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("UserProfileApp (EE)", () => {
  it("should show all form fields, even when password login is disabled", () => {
    setup({ isPasswordLoginEnabled: false, enterprisePlugins: ["auth"] });

    expect(screen.getByText(/first name/i)).toBeInTheDocument();
    expect(screen.getByText(/last name/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/language/i)).toBeInTheDocument();
  });
});
