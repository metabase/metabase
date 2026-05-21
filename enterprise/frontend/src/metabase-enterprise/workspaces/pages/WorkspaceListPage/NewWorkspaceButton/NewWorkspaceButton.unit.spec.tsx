import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { NewWorkspaceButton } from "./NewWorkspaceButton";

function setup() {
  renderWithProviders(<Route path="*" component={NewWorkspaceButton} />, {
    withRouter: true,
  });
}

describe("NewWorkspaceButton", () => {
  it("opens the New workspace modal when clicked", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      await screen.findByRole("heading", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });
});
