import {
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupListTableRemappingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
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
  // Unjustified type cast. FIXME
  remappings = [] as TableRemapping[],
  workspace = createMockCurrentWorkspace({
    name: "Dev workspace",
    databases: {
      [POSTGRES.id]: createMockCurrentWorkspaceDatabase({
        input_schemas: ["public"],
        output: { schema: "ws_dev" },
      }),
    },
  }),
} = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupGetCurrentWorkspaceEndpoint(workspace);
  setupListTableRemappingsEndpoint(remappings);

  renderWithProviders(<Route path="*" element={<CurrentWorkspacePage />} />, {
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
});
