import { Route } from "react-router";

import { setupApplyAdvancedConfigEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

function setup() {
  setupApplyAdvancedConfigEndpoint();
  renderWithProviders(
    <Route path="*" component={() => <WorkspaceEmptyState databases={[]} />} />,
    {
      withRouter: true,
      storeInitialState: {
        settings: createMockSettingsState({ "show-metabase-links": true }),
      },
    },
  );
}

describe("WorkspaceEmptyState", () => {
  it("renders the create workspace button", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });

  it("renders docs link buttons", () => {
    setup();

    expect(
      screen.getByRole("link", { name: /Agent-driven development/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Using remote sync/ }),
    ).toBeInTheDocument();
  });

  it("shows the upload-config button", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Upload a workspace config" }),
    ).toBeInTheDocument();
  });
});
