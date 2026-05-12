import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceDatabaseList } from "./WorkspaceDatabaseList";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

const SNOWFLAKE = createMockDatabase({
  id: 11,
  name: "Snowflake",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 200, db_id: 11, schema: "raw", name: "events" }),
  ],
});

function setup({
  workspace = createMockWorkspace(),
  availableDatabases = [POSTGRES, SNOWFLAKE],
} = {}) {
  setupDatabasesEndpoints(availableDatabases);
  setupCreateWorkspaceDatabaseEndpoint(workspace);

  renderWithProviders(
    <WorkspaceDatabaseList
      workspace={workspace}
      availableDatabases={availableDatabases}
    />,
  );
}

describe("WorkspaceDatabaseList", () => {
  it("can open the add modal and pick a database", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Add database/ }));

    await userEvent.click(await screen.findByLabelText("Database"));
    expect(
      await screen.findByRole("option", { name: "Postgres" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Snowflake" }),
    ).toBeInTheDocument();
  });

  it("excludes already-selected databases from the picker", async () => {
    const workspace = createMockWorkspace({
      databases: [
        createMockWorkspaceDatabase({
          database_id: POSTGRES.id,
          input_schemas: ["public"],
        }),
      ],
    });
    setup({ workspace });

    await userEvent.click(
      screen.getByRole("button", { name: /Add another database/ }),
    );

    await userEvent.click(await screen.findByLabelText("Database"));
    expect(
      await screen.findByRole("option", { name: "Snowflake" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Postgres" }),
    ).not.toBeInTheDocument();
  });
});
