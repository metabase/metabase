import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupListTableRemappingsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TableRemapping, WorkspaceInstance } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTableRemapping,
  createMockWorkspaceInstance,
  createMockWorkspaceInstanceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceInstancePage } from "./WorkspaceInstancePage";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

function setup({
  remappings = [] as TableRemapping[],
  workspace = createMockWorkspaceInstance({
    name: "Dev workspace",
    databases: {
      [POSTGRES.name]: createMockWorkspaceInstanceDatabase({
        input_schemas: ["public"],
        output: { schema: "ws_dev" },
      }),
    },
  }) as WorkspaceInstance | null,
} = {}) {
  setupPropertiesEndpoints(
    createMockSettings({ "instance-workspace": workspace }),
  );
  setupSettingsEndpoints([]);
  setupDatabasesEndpoints([POSTGRES]);
  setupListTableRemappingsEndpoint(remappings);

  const state = createMockState({
    settings: mockSettings({ "instance-workspace": workspace }),
  });

  renderWithProviders(<Route path="*" component={WorkspaceInstancePage} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

describe("WorkspaceInstancePage", () => {
  it("renders the empty state when there are no remappings", async () => {
    setup();

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      await screen.findByText(/Tables will be remapped here/i),
    ).toBeInTheDocument();
  });

  it("renders the remapping rows when there is content", async () => {
    setup({
      remappings: [
        createMockTableRemapping({
          database_id: POSTGRES.id,
          from_schema: "public",
          from_table_name: "orders",
          to_schema: "ws_dev",
          to_table_name: "orders",
        }),
      ],
    });

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Postgres" }),
    ).toBeInTheDocument();
  });

  it("renders the empty state with set up button when no workspace is set up", async () => {
    setup({ workspace: null });

    expect(
      await screen.findByRole("heading", {
        name: /Isolated spaces for agents and developers/,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Set up a workspace" }),
    ).toBeInTheDocument();
  });

  it("hides the help menu in the empty state", async () => {
    setup({ workspace: null });

    expect(
      await screen.findByRole("heading", {
        name: /Isolated spaces for agents and developers/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Help/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the help menu when a workspace is set up", async () => {
    setup();

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Help/ }),
    ).toBeInTheDocument();
  });

  it("renders the delete section", async () => {
    setup();

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      await screen.findByTestId("workspace-instance-delete-section"),
    ).toBeInTheDocument();
  });
});
