import { renderWithProviders, screen } from "__support__/ui";

import { ActionsHeader } from "./ActionsHeader";

describe("ActionsHeader", () => {
  it("should link to the new action page when actions can be created", () => {
    renderWithProviders(<ActionsHeader canCreate />, { withRouter: true });

    expect(
      screen.getByRole("link", { name: /New action/ }),
    ).toBeInTheDocument();
  });

  it("should disable the button when actions can't be created", () => {
    renderWithProviders(<ActionsHeader canCreate={false} />, {
      withRouter: true,
    });

    expect(screen.getByRole("button", { name: /New action/ })).toBeDisabled();
  });
});
