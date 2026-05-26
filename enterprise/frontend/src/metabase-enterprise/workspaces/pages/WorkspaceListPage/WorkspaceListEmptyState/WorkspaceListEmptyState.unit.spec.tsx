import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { WorkspaceListEmptyState } from "./WorkspaceListEmptyState";

function setup() {
  renderWithProviders(<Route path="*" component={WorkspaceListEmptyState} />, {
    withRouter: true,
    storeInitialState: {
      settings: createMockSettingsState(
        createMockSettings({ "show-metabase-links": true }),
      ),
    },
  });
}

describe("WorkspaceListEmptyState", () => {
  it("renders the create workspace button", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });

  it("renders docs link buttons", () => {
    setup();

    expect(
      screen.getByRole("link", { name: /File-based development/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Using remote sync/ }),
    ).toBeInTheDocument();
  });
});
