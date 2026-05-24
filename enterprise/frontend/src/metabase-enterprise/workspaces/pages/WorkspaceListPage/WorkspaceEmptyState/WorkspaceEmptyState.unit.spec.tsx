import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

function setup() {
  renderWithProviders(<Route path="*" component={WorkspaceEmptyState} />, {
    withRouter: true,
  });
}

describe("WorkspaceEmptyState", () => {
  it("renders the main-instance and developer-instance sections", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: /Is this your main instance/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a workspace" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /developer instance/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set up a developer instance" }),
    ).toBeInTheDocument();
  });
});
