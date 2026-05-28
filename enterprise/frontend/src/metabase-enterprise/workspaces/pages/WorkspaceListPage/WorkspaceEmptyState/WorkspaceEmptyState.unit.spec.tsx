import { Route } from "react-router";

import { setupApplyAdvancedConfigEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

function setup({ isAdmin = false }: { isAdmin?: boolean } = {}) {
  setupApplyAdvancedConfigEndpoint();
  renderWithProviders(<Route path="*" component={WorkspaceEmptyState} />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: createMockSettingsState({ "show-metabase-links": true }),
    }),
  });
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
      screen.getByRole("link", { name: /File-based development/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Using remote sync/ }),
    ).toBeInTheDocument();
  });

  it("does not show the set-up-this-instance button for non-admins", () => {
    setup({ isAdmin: false });

    expect(
      screen.queryByRole("button", { name: "set up this instance" }),
    ).not.toBeInTheDocument();
  });

  it("shows the set-up-this-instance button for admins", () => {
    setup({ isAdmin: true });

    expect(
      screen.getByRole("button", { name: "set up this instance" }),
    ).toBeInTheDocument();
  });
});
