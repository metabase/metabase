import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
  setupGetWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspacePage } from "./WorkspacePage";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas", "workspace"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  setupGetWorkspaceEndpoint(WORKSPACE);
  setupDatabasesEndpoints([POSTGRES]);
  setupCreateWorkspaceDatabaseEndpoint(
    createMockWorkspace({
      ...WORKSPACE,
      databases: [
        createMockWorkspaceDatabase({
          database_id: POSTGRES.id,
          input_schemas: ["public"],
        }),
      ],
    }),
  );

  renderWithProviders(<WorkspacePage params={{ workspaceId: "1" }} />, {
    withRouter: true,
  });
}

describe("WorkspacePage", () => {
  it("loads the workspace and lets you add a database", async () => {
    setup();

    expect(await screen.findByText("My workspace")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Add database/ }));

    await userEvent.click(await screen.findByLabelText("Database"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Postgres" }),
    );
    await userEvent.click(screen.getByLabelText("Schemas to include"));
    await userEvent.click(
      await screen.findByRole("option", { name: "public" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Provision database" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}/database`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });
});
