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
import type { CurrentWorkspace } from "metabase-types/api";
import {
  createMockCurrentWorkspace,
  createMockCurrentWorkspaceDatabase,
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { WorkspaceIndexPage } from "./WorkspaceIndexPage";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

const WORKSPACE = createMockCurrentWorkspace({
  name: "Dev workspace",
  databases: {
    [POSTGRES.id]: createMockCurrentWorkspaceDatabase({
      input_schemas: ["public"],
      output: { schema: "ws_dev" },
    }),
  },
});

type SetupOpts = {
  isAdmin?: boolean;
  workspace?: CurrentWorkspace | null;
};

function setup({ isAdmin = true, workspace = null }: SetupOpts = {}) {
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
      await screen.findByTestId("current-workspace-page"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-list-page")).not.toBeInTheDocument();
  });

  it("admin without a workspace sees the list page", async () => {
    setup({ isAdmin: true, workspace: null });

    expect(
      await screen.findByTestId("workspace-list-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("current-workspace-page"),
    ).not.toBeInTheDocument();
  });

  it("non-admin skips the instance lookup and sees the list page", async () => {
    setup({
      isAdmin: false,
      workspace: WORKSPACE,
    });

    expect(
      await screen.findByTestId("workspace-list-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("current-workspace-page"),
    ).not.toBeInTheDocument();
  });
});
