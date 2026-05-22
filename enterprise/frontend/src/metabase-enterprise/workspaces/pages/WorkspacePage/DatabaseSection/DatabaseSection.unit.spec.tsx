import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseSection } from "./DatabaseSection";

const POSTGRES = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas", "workspace"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

const SNOWFLAKE = createMockDatabase({
  id: 11,
  name: "Snowflake",
  features: ["schemas", "workspace"],
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
    <DatabaseSection
      workspace={workspace}
      availableDatabases={availableDatabases}
    />,
  );
}

describe("DatabaseSection", () => {
  it("can open the add modal and shows both databases as radio options", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Add database/ }));

    expect(
      await screen.findByRole("radio", { name: "Postgres" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Snowflake" }),
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

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Snowflake")).toBeInTheDocument();
    expect(within(dialog).queryByText("Postgres")).not.toBeInTheDocument();
  });
});
