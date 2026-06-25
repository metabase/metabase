import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateWorkspaceEndpoint,
  setupDatabasesEndpoints,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

const ELIGIBLE_DATABASE = createMockDatabase({
  features: ["workspace"],
  settings: { "database-enable-workspaces": true },
});

function setup({ workspaces = [] as Workspace[] } = {}) {
  setupListWorkspacesEndpoint(workspaces);
  setupDatabasesEndpoints([ELIGIBLE_DATABASE]);
  setupCreateWorkspaceEndpoint(createMockWorkspace({ name: "Brand new" }));

  renderWithProviders(<Route path="*" component={WorkspaceListPage} />, {
    withRouter: true,
  });
}

describe("WorkspaceListPage", () => {
  it("from the empty state, opens the Add workspace modal", async () => {
    setup();

    expect(
      await screen.findByTestId("workspace-list-page"),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: /Create a workspace/i }),
    );

    expect(
      await screen.findAllByRole("heading", { name: /Create a workspace/i }),
    ).not.toHaveLength(0);
  });

  it("when not empty, renders a card with a menu for each workspace", async () => {
    const workspace = createMockWorkspace({ id: 42, name: "Existing" });
    setup({ workspaces: [workspace] });

    const item = await screen.findByRole("region", { name: "Existing" });
    expect(item).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Workspace options" }),
    ).toBeInTheDocument();
  });
});
