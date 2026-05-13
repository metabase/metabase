import {
  setupDatabasesEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupListTableRemappingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TableRemapping } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTableRemapping,
  createMockWorkspaceInstance,
  createMockWorkspaceInstanceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceInstancePage } from "./WorkspaceInstancePage";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

function setup({ remappings = [] as TableRemapping[] } = {}) {
  setupDatabasesEndpoints([POSTGRES]);
  setupGetCurrentWorkspaceEndpoint(
    createMockWorkspaceInstance({
      name: "Dev workspace",
      databases: {
        [POSTGRES.id]: createMockWorkspaceInstanceDatabase({
          input_schemas: ["public"],
          output: { schema: "ws_dev" },
        }),
      },
    }),
  );
  setupListTableRemappingsEndpoint(remappings);

  renderWithProviders(<WorkspaceInstancePage />, { withRouter: true });
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
    expect(await screen.findByText("public/orders")).toBeInTheDocument();
    expect(screen.getByText("ws_dev/orders")).toBeInTheDocument();
  });
});
