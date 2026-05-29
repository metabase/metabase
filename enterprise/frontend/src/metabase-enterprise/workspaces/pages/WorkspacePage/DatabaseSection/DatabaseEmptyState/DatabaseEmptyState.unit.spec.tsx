import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseEmptyState } from "./DatabaseEmptyState";

const TEST_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas", "workspace"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

function setup({
  workspace = createMockWorkspace(),
  createdWorkspace = createMockWorkspace({
    databases: [
      createMockWorkspaceDatabase({
        database_id: TEST_DATABASE.id,
        input_schemas: ["public"],
      }),
    ],
  }),
}: {
  workspace?: Workspace;
  createdWorkspace?: Workspace;
} = {}) {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupCreateWorkspaceDatabaseEndpoint(createdWorkspace);

  renderWithProviders(
    <DatabaseEmptyState
      workspace={workspace}
      availableDatabases={[TEST_DATABASE]}
    />,
  );

  return { workspace };
}

describe("DatabaseEmptyState", () => {
  it("can add a database from the empty state", async () => {
    const { workspace } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Add database/ }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByLabelText("Schemas to include"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "public" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add database" }),
    );

    await waitFor(() => {
      const request = fetchMock.callHistory.lastCall(
        `path:/api/ee/workspace-manager/${workspace.id}/database`,
      )?.request;
      expect(request).toBeDefined();
    });
    const request = fetchMock.callHistory.lastCall(
      `path:/api/ee/workspace-manager/${workspace.id}/database`,
    )?.request;
    expect(await request?.json()).toEqual({
      database_id: TEST_DATABASE.id,
      input_schemas: ["public"],
    });
  });
});
