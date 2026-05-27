import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
  setupGetWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

  renderWithProviders(
    <Route
      path="*"
      component={() => <WorkspacePage params={{ workspaceId: "1" }} />}
    />,
    {
      withRouter: true,
    },
  );
}

describe("WorkspacePage", () => {
  it("loads the workspace and lets you add a database", async () => {
    setup();

    expect(await screen.findByTestId("workspace-name-input")).toHaveValue(
      "My workspace",
    );

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
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}/database`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });
});
