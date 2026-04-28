import { Route } from "react-router";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { NewWorkspacePage } from "./NewWorkspacePage";

function setup() {
  setupDatabaseListEndpoint([]);
  renderWithProviders(<Route path="/" component={NewWorkspacePage} />, {
    withRouter: true,
    initialRoute: "/",
  });
}

describe("NewWorkspacePage", () => {
  it("should disable Save until the workspace has at least one database", () => {
    setup();

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
