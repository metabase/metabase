import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

function setup() {
  renderWithProviders(<Route path="*" component={WorkspaceEmptyState} />, {
    withRouter: true,
    storeInitialState: {
      settings: createMockSettingsState(
        createMockSettings({ "show-metabase-links": true }),
      ),
    },
  });
}

describe("WorkspaceEmptyState", () => {
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
