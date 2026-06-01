import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupDeleteWorkspaceDatabaseEndpoint,
  setupGetWorkspaceEndpoint,
  setupUpdateWorkspaceDatabaseEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseItem } from "./DatabaseItem";

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
  setupGetWorkspaceEndpoint(WORKSPACE);

  renderWithProviders(
    <DatabaseItem
      workspace={WORKSPACE}
      workspaceDatabase={WORKSPACE.databases[0]}
      database={TEST_DATABASE}
    />,
  );
}

describe("DatabaseItem", () => {
  it("opens the edit modal from the menu when Edit is clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Database actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Edit/ }),
    );

    expect(
      await screen.findByRole("heading", {
        name: `Edit settings for ${TEST_DATABASE.name}`,
      }),
    ).toBeInTheDocument();
  });

  it("calls DELETE on the database after confirming Remove", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Database actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Remove/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
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
