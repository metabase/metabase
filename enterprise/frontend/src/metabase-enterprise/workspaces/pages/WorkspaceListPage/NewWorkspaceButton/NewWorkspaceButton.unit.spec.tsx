import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { NewWorkspaceButton } from "./NewWorkspaceButton";

function setup() {
  renderWithProviders(<NewWorkspaceButton />, { withRouter: true });
}

describe("NewWorkspaceButton", () => {
  it("opens the New workspace modal when clicked", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Add/ }));

    expect(
      await screen.findByRole("heading", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });
});
