import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupListTableRemappingsEndpoint,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { WorkspaceInstance } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
  createMockWorkspaceInstance,
  createMockWorkspaceInstanceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceIndexPage } from "./WorkspaceIndexPage";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

const WORKSPACE = createMockWorkspaceInstance({
  name: "Dev workspace",
  databases: {
    [POSTGRES.id]: createMockWorkspaceInstanceDatabase({
      input_schemas: ["public"],
      output: { schema: "ws_dev" },
    }),
  },
});

type SetupOpts = {
  isAdmin?: boolean;
  canManageWorkspaces?: boolean;
  workspace?: WorkspaceInstance | null;
};

function setup({
  isAdmin = true,
  canManageWorkspaces = false,
  workspace = null,
}: SetupOpts = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupGetCurrentWorkspaceEndpoint(workspace);
  setupListTableRemappingsEndpoint([]);
  setupListWorkspacesEndpoint([]);

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: isAdmin,
        can_access_db_details: false,
        can_manage_workspaces: canManageWorkspaces,
      },
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        workspaces: true,
      }),
    }),
  });

  renderWithProviders(<Route path="*" component={WorkspaceIndexPage} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

describe("WorkspaceIndexPage", () => {
  it("admin with a workspace loaded sees the instance page", async () => {
    setup({ isAdmin: true, workspace: WORKSPACE });

    expect(
      await screen.findByTestId("workspace-instance-page"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-list-page")).not.toBeInTheDocument();
  });

  it("admin without a workspace sees the list page", async () => {
    setup({ isAdmin: true, workspace: null });

    expect(
      await screen.findByTestId("workspace-list-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("workspace-instance-page"),
    ).not.toBeInTheDocument();
  });

  it("non-admin with manage-workspaces permission skips the instance lookup and sees the list page", async () => {
    setup({
      isAdmin: false,
      canManageWorkspaces: true,
      workspace: WORKSPACE,
    });

    expect(
      await screen.findByTestId("workspace-list-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("workspace-instance-page"),
    ).not.toBeInTheDocument();
  });
});
