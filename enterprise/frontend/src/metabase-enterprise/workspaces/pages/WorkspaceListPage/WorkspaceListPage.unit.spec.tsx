import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceEndpoint,
  setupDatabasesEndpoints,
  setupListWorkspaceInstancesEndpoint,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceInstance,
} from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

const ELIGIBLE_DATABASE = createMockDatabase({
  features: ["workspace"],
  settings: { "database-enable-workspaces": true },
});

type SetupOpts = {
  workspaces?: Workspace[];
  instances?: WorkspaceInstance[];
};

function setup({ workspaces = [], instances = [] }: SetupOpts = {}) {
  setupListWorkspacesEndpoint(workspaces);
  setupDatabasesEndpoints([ELIGIBLE_DATABASE]);
  setupCreateWorkspaceEndpoint(createMockWorkspace({ name: "Brand new" }));
  setupListWorkspaceInstancesEndpoint(instances);

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

  it("offers all instances in the create modal, warning when a taken one is picked", async () => {
    setup({
      workspaces: [createMockWorkspace({ id: 1, name: "First" })],
      instances: [
        createMockWorkspaceInstance({ id: 7, name: "Dev child" }),
        createMockWorkspaceInstance({ id: 8, name: "Taken", workspace_id: 1 }),
      ],
    });

    await userEvent.click(await screen.findByRole("button", { name: "New" }));

    const picker = await screen.findByLabelText("Instance");
    await userEvent.click(picker);
    expect(await screen.findByText("Dev child")).toBeInTheDocument();

    await userEvent.click(screen.getByText('Taken — used by "First"'));
    expect(
      await screen.findByText(/erase that workspace's deployment/),
    ).toBeInTheDocument();
  });

  it("shows the assigned instance and a set-up action on the workspace card", async () => {
    const workspace = createMockWorkspace({
      id: 42,
      name: "Existing",
      instance: {
        id: 7,
        name: "Dev child",
        url: "https://child.example.com",
        initialized_at: null,
      },
    });
    setup({ workspaces: [workspace] });

    expect(
      await screen.findByText(/Assigned to Dev child/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace options" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /Set up the instance/ }),
    ).toBeInTheDocument();
  });
});
