import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { NewDatabaseModal } from "./NewDatabaseModal";

const TEST_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

type SetupOpts = {
  workspace?: Workspace;
  availableDatabases?: Database[];
  createdWorkspace?: Workspace;
};

function setup({
  workspace = createMockWorkspace(),
  availableDatabases = [TEST_DATABASE],
  createdWorkspace = createMockWorkspace({
    databases: [
      createMockWorkspaceDatabase({
        database_id: TEST_DATABASE.id,
        input_schemas: ["public"],
      }),
    ],
  }),
}: SetupOpts = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(availableDatabases);
  setupCreateWorkspaceDatabaseEndpoint(createdWorkspace);

  renderWithProviders(
    <NewDatabaseModal
      workspace={workspace}
      availableDatabases={availableDatabases}
      opened
      onCreate={onCreate}
      onClose={onClose}
    />,
  );

  return { onCreate, onClose, workspace, createdWorkspace };
}

describe("NewDatabaseModal", () => {
  it("can create a workspace database", async () => {
    const { onCreate, createdWorkspace } = setup();

    await userEvent.click(screen.getByLabelText("Schemas to include"));
    await userEvent.click(
      await screen.findByRole("option", { name: "public" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add database" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
  });
});
