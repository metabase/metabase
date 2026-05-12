import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupDeleteWorkspaceDatabaseEndpoint,
  setupUpdateWorkspaceDatabaseEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceDatabaseSection } from "./WorkspaceDatabaseSection";

const TEST_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

const WORKSPACE = createMockWorkspace({
  id: 1,
  databases: [
    createMockWorkspaceDatabase({
      database_id: TEST_DATABASE.id,
      input_schemas: ["public"],
    }),
  ],
});

function setup() {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupUpdateWorkspaceDatabaseEndpoint(WORKSPACE, TEST_DATABASE.id);
  setupDeleteWorkspaceDatabaseEndpoint(WORKSPACE, TEST_DATABASE.id);

  renderWithProviders(
    <WorkspaceDatabaseSection
      workspace={WORKSPACE}
      workspaceDatabase={WORKSPACE.databases[0]}
      availableDatabases={[TEST_DATABASE]}
    />,
  );
}

describe("WorkspaceDatabaseSection", () => {
  it("opens the edit modal when Edit is clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit database" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Edit database" }),
    ).toBeInTheDocument();
  });

  it("calls DELETE on the database after confirming", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove database" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Deprovision" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}/database/${TEST_DATABASE.id}`,
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
  });
});
