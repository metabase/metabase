import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupListTableRemappingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TableRemapping } from "metabase-types/api";
import {
  createMockCurrentWorkspace,
  createMockCurrentWorkspaceDatabase,
  createMockDatabase,
  createMockTableRemapping,
} from "metabase-types/api/mocks";

import { CurrentWorkspacePage } from "./CurrentWorkspacePage";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

function setup({
  remappings = [] as TableRemapping[],
  workspace = createMockCurrentWorkspace({
    name: "Dev workspace",
    databases: {
      [POSTGRES.id]: createMockCurrentWorkspaceDatabase({
        input_schemas: ["public"],
        output: { schema: "ws_dev" },
      }),
    },
    can_write: true,
  }),
} = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupGetCurrentWorkspaceEndpoint(workspace);
  setupListTableRemappingsEndpoint(remappings);

  renderWithProviders(<Route path="*" component={CurrentWorkspacePage} />, {
    withRouter: true,
  });
}

describe("CurrentWorkspacePage", () => {
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

  it("renders the delete section", async () => {
    setup();

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      await screen.findByTestId("workspace-instance-delete-section"),
    ).toBeInTheDocument();
  });

  it("hides the delete section when can_write is false", async () => {
    setup({
      workspace: createMockCurrentWorkspace({
        name: "Dev workspace",
        databases: {
          [POSTGRES.id]: createMockCurrentWorkspaceDatabase({
            input_schemas: ["public"],
            output: { schema: "ws_dev" },
          }),
        },
        can_write: false,
      }),
    });

    expect(await screen.findByText("Dev workspace")).toBeInTheDocument();
    expect(
      screen.queryByTestId("workspace-instance-delete-section"),
    ).not.toBeInTheDocument();
  });
});
