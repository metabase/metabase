import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateWorkspaceEndpoint,
  setupDatabasesEndpoints,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["workspace"],
});

function setup({ workspaces = [] as Workspace[] } = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupListWorkspacesEndpoint(workspaces);
  setupCreateWorkspaceEndpoint(createMockWorkspace({ name: "Brand new" }));

  renderWithProviders(<Route path="*" component={WorkspaceListPage} />, {
    withRouter: true,
  });
}

describe("WorkspaceListPage", () => {
  it("from the empty state, opens the Add workspace modal", async () => {
    setup();

    expect(await screen.findByText(/Isolated spaces/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Create a workspace/ }),
    );

    expect(
      await screen.findAllByRole("heading", { name: "Create a workspace" }),
    ).not.toHaveLength(0);
  });

  it("when not empty, each workspace card links to its workspace page", async () => {
    const workspace = createMockWorkspace({ id: 42, name: "Existing" });
    setup({ workspaces: [workspace] });

    expect(
      await screen.findByRole("region", { name: "Existing" }),
    ).toHaveAttribute("href", Urls.workspace(workspace.id));
  });
});
