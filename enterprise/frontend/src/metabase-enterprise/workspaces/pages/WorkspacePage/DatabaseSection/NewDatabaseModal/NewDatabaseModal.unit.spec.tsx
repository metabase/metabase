import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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

const POSTGRES_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas", "workspace"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
  ],
});

const MYSQL_DATABASE = createMockDatabase({
  id: 20,
  name: "MySQL",
  features: ["workspace"],
  tables: [createMockTable({ id: 200, db_id: 20, schema: "", name: "people" })],
});

const UNSUPPORTED_DATABASE = createMockDatabase({
  id: 30,
  name: "Unsupported",
  features: ["schemas"],
});

type SetupOpts = {
  workspace?: Workspace;
  availableDatabases?: Database[];
  createdWorkspace?: Workspace;
};

function setup({
  workspace = createMockWorkspace(),
  availableDatabases = [POSTGRES_DATABASE],
  createdWorkspace = createMockWorkspace({
    databases: [
      createMockWorkspaceDatabase({
        database_id: POSTGRES_DATABASE.id,
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

  it("renders a single database as text without a radio group", () => {
    setup({ availableDatabases: [POSTGRES_DATABASE] });

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("disables radios for databases that do not support workspaces", () => {
    setup({ availableDatabases: [POSTGRES_DATABASE, UNSUPPORTED_DATABASE] });

    expect(screen.getByRole("radio", { name: "Postgres" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Unsupported/ })).toBeDisabled();
  });

  it("requires at least one schema when the database supports schemas", async () => {
    const { onCreate } = setup({ availableDatabases: [POSTGRES_DATABASE] });

    await userEvent.click(screen.getByRole("button", { name: "Add database" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(
      fetchMock.callHistory.lastCall(
        "path:/api/ee/workspace-manager/1/database",
      ),
    ).toBeUndefined();
  });

  it("allows submitting without schemas when the database does not support schemas", async () => {
    const createdWorkspace = createMockWorkspace({
      databases: [
        createMockWorkspaceDatabase({
          database_id: MYSQL_DATABASE.id,
          input_schemas: [],
        }),
      ],
    });
    const { onCreate } = setup({
      availableDatabases: [MYSQL_DATABASE],
      createdWorkspace,
    });

    expect(
      screen.queryByLabelText("Schemas to include"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add database" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
  });
});
