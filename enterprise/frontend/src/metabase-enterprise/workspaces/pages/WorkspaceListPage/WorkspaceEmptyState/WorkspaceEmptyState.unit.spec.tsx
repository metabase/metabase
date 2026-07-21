import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

function setup() {
  renderWithProviders(
    <Route path="*" element={<WorkspaceEmptyState databases={[]} />} />,
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
});
