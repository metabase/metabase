import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupGetCurrentWorkspaceEndpointError,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Database, WorkspaceInstance } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceInstance,
  createMockWorkspaceInstanceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceInstanceOverviewPage } from "./WorkspaceInstanceOverviewPage";

type SetupOpts = {
  workspace?: WorkspaceInstance;
  databases?: Database[];
  withWorkspaceError?: boolean;
};

function setup({
  workspace = createMockWorkspaceInstance(),
  databases = [createMockDatabase({ id: 1, name: "Sample DB" })],
  withWorkspaceError = false,
}: SetupOpts = {}) {
  if (withWorkspaceError) {
    setupGetCurrentWorkspaceEndpointError();
  } else {
    setupGetCurrentWorkspaceEndpoint(workspace);
  }
  setupDatabasesEndpoints(databases);
  mockGetBoundingClientRect({ width: 800, height: 600 });

  return renderWithProviders(
    <Route
      path={Urls.workspaceInstanceOverview()}
      component={WorkspaceInstanceOverviewPage}
    />,
    {
      withRouter: true,
      initialRoute: Urls.workspaceInstanceOverview(),
    },
  );
}

function findTable() {
  return screen.findByRole("treegrid", { name: /Workspace databases/i });
}

function getDetailValue(label: string) {
  const labelEl = screen
    .getAllByText(label)
    .find((element) => element.closest("a") == null);
  const row = labelEl?.parentElement;
  if (row == null) {
    throw new Error(`Could not find detail row for label "${label}"`);
  }
  return row;
}

describe("WorkspaceInstanceOverviewPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should render the workspace name, database count and remappings count", async () => {
    setup({
      workspace: createMockWorkspaceInstance({
        name: "Acme Analytics",
        remappings_count: 5,
        databases: {
          1: createMockWorkspaceInstanceDatabase({ name: "Sample DB" }),
          2: createMockWorkspaceInstanceDatabase({ name: "Other DB" }),
        },
      }),
      databases: [
        createMockDatabase({ id: 1, name: "Sample DB" }),
        createMockDatabase({ id: 2, name: "Other DB" }),
      ],
    });

    expect(await screen.findByText("Acme Analytics")).toBeInTheDocument();
    expect(
      within(getDetailValue("Databases")).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(getDetailValue("Table remappings")).getByText("5"),
    ).toBeInTheDocument();
  });

  it("should render one row per workspace database with readable and isolation schemas", async () => {
    setup({
      workspace: createMockWorkspaceInstance({
        databases: {
          1: createMockWorkspaceInstanceDatabase({
            name: "Sample DB",
            input_schemas: ["public", "raw"],
          }),
          2: createMockWorkspaceInstanceDatabase({
            name: "Analytics DB",
            input_schemas: ["events"],
          }),
        },
      }),
      databases: [
        createMockDatabase({ id: 1, name: "Sample DB" }),
        createMockDatabase({ id: 2, name: "Analytics DB" }),
      ],
    });

    const table = await findTable();
    expect(within(table).getAllByRole("row")).toHaveLength(2);

    expect(within(table).getByText("Sample DB")).toBeInTheDocument();
    expect(within(table).getByText("public, raw")).toBeInTheDocument();
    expect(within(table).getByText("workspace_a")).toBeInTheDocument();

    expect(within(table).getByText("Analytics DB")).toBeInTheDocument();
    expect(within(table).getByText("events")).toBeInTheDocument();
    expect(within(table).getByText("workspace_b")).toBeInTheDocument();
  });

  it("should fall back to the workspace config name when the database is missing from the databases list", async () => {
    setup({
      workspace: createMockWorkspaceInstance({
        databases: {
          99: createMockWorkspaceInstanceDatabase({
            name: "Config-only DB",
            input_schemas: ["public"],
          }),
        },
      }),
      databases: [],
    });

    const table = await findTable();
    expect(within(table).getByText("Config-only DB")).toBeInTheDocument();
  });

  it("should show an empty state when the workspace has no databases", async () => {
    setup({
      workspace: createMockWorkspaceInstance({
        name: "Empty Workspace",
        databases: {},
      }),
    });

    expect(await screen.findByText("Empty Workspace")).toBeInTheDocument();
    expect(
      screen.getByText("No databases in this workspace"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("treegrid", { name: /Workspace databases/i }),
    ).not.toBeInTheDocument();
  });

  it("should hide the page body when the workspace request fails", async () => {
    setup({ withWorkspaceError: true });

    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByText(/The active workspace configuration/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("treegrid", { name: /Workspace databases/i }),
    ).not.toBeInTheDocument();
  });

  it("should render both header tabs", async () => {
    setup();

    const overviewTab = await screen.findByRole("link", { name: /Overview/i });
    expect(overviewTab).toHaveAttribute(
      "href",
      Urls.workspaceInstanceOverview(),
    );
    expect(
      screen.getByRole("link", { name: /Table remappings/i }),
    ).toHaveAttribute("href", Urls.workspaceInstanceRemappings());
  });
});
