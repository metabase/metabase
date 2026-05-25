import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateWorkspaceEndpoint,
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceInstance,
} from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["workspace"],
});

function setup({
  workspaces = [] as Workspace[],
  currentWorkspace = null as WorkspaceInstance | null,
} = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupListWorkspacesEndpoint(workspaces);
  setupGetCurrentWorkspaceEndpoint(currentWorkspace);
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

  it("shows the warning state when the instance is itself in a workspace", async () => {
    const workspace = createMockWorkspace({ id: 42, name: "Existing" });
    setup({
      workspaces: [workspace],
      currentWorkspace: createMockWorkspaceInstance(),
    });

    expect(
      await screen.findByText(
        /You cannot manage workspaces when the current instance is in a workspace itself/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Existing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create a workspace/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Help/ }),
    ).not.toBeInTheDocument();
  });
});
