import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupUpdateWorkspaceDatabaseEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { UpdateDatabaseModal } from "./UpdateDatabaseModal";

const TEST_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
    createMockTable({
      id: 101,
      db_id: 10,
      schema: "analytics",
      name: "events",
    }),
  ],
});

type SetupOpts = {
  workspace?: Workspace;
  workspaceDatabase?: WorkspaceDatabase;
  database?: Database;
  updatedWorkspace?: Workspace;
};

function setup({
  workspace = createMockWorkspace(),
  workspaceDatabase = createMockWorkspaceDatabase({
    database_id: TEST_DATABASE.id,
    input_schemas: ["public"],
  }),
  database = TEST_DATABASE,
  updatedWorkspace = createMockWorkspace({
    databases: [
      createMockWorkspaceDatabase({
        database_id: TEST_DATABASE.id,
        input_schemas: ["public", "analytics"],
      }),
    ],
  }),
}: SetupOpts = {}) {
  const onUpdate = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints([TEST_DATABASE]);
  setupUpdateWorkspaceDatabaseEndpoint(updatedWorkspace, TEST_DATABASE.id);

  renderWithProviders(
    <UpdateDatabaseModal
      workspace={workspace}
      workspaceDatabase={workspaceDatabase}
      database={database}
      opened
      onUpdate={onUpdate}
      onClose={onClose}
    />,
  );

  return { onUpdate, onClose, updatedWorkspace };
}

describe("UpdateDatabaseModal", () => {
  it("can update a workspace database", async () => {
    const { onUpdate, updatedWorkspace } = setup();

    await userEvent.click(screen.getByLabelText("Schemas to include"));
    await userEvent.click(
      await screen.findByRole("option", { name: "analytics" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Provision database" }),
    );

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(updatedWorkspace),
    );
  });
});
