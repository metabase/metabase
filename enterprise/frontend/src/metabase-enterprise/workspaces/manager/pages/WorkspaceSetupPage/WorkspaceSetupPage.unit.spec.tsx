import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupGetWorkspaceEndpoint,
  setupGetWorkspaceEndpointError,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceSetupPage } from "./WorkspaceSetupPage";

type SetupOpts = {
  workspace?: Workspace;
  databases?: Database[];
  withWorkspaceError?: boolean;
};

function setup({
  workspace = createMockWorkspace({ id: 7, name: "Acme analytics" }),
  databases = [
    createMockDatabase({
      id: 1,
      name: "Postgres prod",
      features: ["workspace"],
    }),
  ],
  withWorkspaceError = false,
}: SetupOpts = {}) {
  if (withWorkspaceError) {
    setupGetWorkspaceEndpointError(workspace.id);
  } else {
    setupGetWorkspaceEndpoint(workspace);
  }
  setupDatabasesEndpoints(databases);

  return renderWithProviders(
    <Route
      path="/data-studio/workspaces/:workspaceId"
      component={WorkspaceSetupPage}
    />,
    {
      withRouter: true,
      initialRoute: Urls.workspace(workspace.id),
    },
  );
}

describe("WorkspaceSetupPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should render the database and setup sections when data is ready", async () => {
    setup({
      workspace: createMockWorkspace({
        id: 7,
        name: "Acme analytics",
        databases: [createMockWorkspaceDatabase({ database_id: 1 })],
      }),
    });

    expect(
      await screen.findByText("Database configuration"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Setup a development instance"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("workspace-page")).toBeInTheDocument();
  });

  it("should not render the page body when the workspace request fails", async () => {
    setup({ withWorkspaceError: true });

    await waitForLoaderToBeRemoved();

    expect(screen.queryByTestId("workspace-page")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Database configuration"),
    ).not.toBeInTheDocument();
  });
});
