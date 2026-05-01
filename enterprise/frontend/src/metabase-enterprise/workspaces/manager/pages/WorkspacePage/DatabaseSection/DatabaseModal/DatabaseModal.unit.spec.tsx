import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupSchemaEndpoints,
  setupUpdateWorkspaceDatabaseEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { CreateDatabaseModal, UpdateDatabaseModal } from "./DatabaseModal";

function buildSupportedDatabase(opts: Partial<Database> = {}): Database {
  return createMockDatabase({
    features: ["workspace", "schemas"],
    tables: [
      createMockTable({ id: 1, db_id: opts.id ?? 1, schema: "public" }),
      createMockTable({ id: 2, db_id: opts.id ?? 1, schema: "raw" }),
      createMockTable({ id: 3, db_id: opts.id ?? 1, schema: "events" }),
    ],
    ...opts,
  });
}

type SetupCreateOpts = {
  workspace?: Workspace;
  databases?: Database[];
};

function setupCreate({
  workspace = createMockWorkspace({ id: 7, databases: [] }),
  databases = [
    buildSupportedDatabase({ id: 1, name: "Postgres prod" }),
    buildSupportedDatabase({ id: 2, name: "Postgres staging" }),
  ],
}: SetupCreateOpts = {}) {
  const onClose = jest.fn();
  databases.forEach((database) => setupSchemaEndpoints(database));
  setupCreateWorkspaceDatabaseEndpoint(workspace.id, workspace);

  renderWithProviders(
    <CreateDatabaseModal
      workspace={workspace}
      databases={databases}
      opened
      onClose={onClose}
    />,
  );

  return { workspace, databases, onClose };
}

type SetupUpdateOpts = {
  workspace?: Workspace;
  databases?: Database[];
  databaseId?: number;
};

function setupUpdate({
  workspace = createMockWorkspace({
    id: 7,
    databases: [
      createMockWorkspaceDatabase({
        database_id: 1,
        input_schemas: ["public"],
      }),
    ],
  }),
  databases = [buildSupportedDatabase({ id: 1, name: "Postgres prod" })],
  databaseId = 1,
}: SetupUpdateOpts = {}) {
  const onClose = jest.fn();
  databases.forEach((database) => setupSchemaEndpoints(database));
  setupUpdateWorkspaceDatabaseEndpoint(workspace.id, databaseId, workspace);

  renderWithProviders(
    <UpdateDatabaseModal
      workspace={workspace}
      databaseId={databaseId}
      databases={databases}
      opened
      onClose={onClose}
    />,
  );

  return { workspace, databases, onClose };
}

async function selectDatabase(name: string | RegExp) {
  await userEvent.click(screen.getByLabelText("Database"));
  const dropdown = await screen.findByRole("listbox");
  await userEvent.click(within(dropdown).getByText(name));
}

async function selectSchemas(names: string[]) {
  await userEvent.click(screen.getByLabelText("Readable schemas"));
  const dropdown = await screen.findByRole("listbox");
  for (const name of names) {
    await userEvent.click(within(dropdown).getByText(name));
  }
}

describe("CreateDatabaseModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should only list databases that support workspaces and are not yet configured", async () => {
    setupCreate({
      workspace: createMockWorkspace({
        id: 7,
        databases: [createMockWorkspaceDatabase({ database_id: 2 })],
      }),
      databases: [
        buildSupportedDatabase({ id: 1, name: "Postgres prod" }),
        buildSupportedDatabase({ id: 2, name: "Postgres staging" }),
        createMockDatabase({ id: 3, name: "MySQL legacy", features: [] }),
      ],
    });

    await userEvent.click(screen.getByLabelText("Database"));
    const dropdown = await screen.findByRole("listbox");
    expect(within(dropdown).getByText("Postgres prod")).toBeInTheDocument();
    expect(
      within(dropdown).queryByText("Postgres staging"),
    ).not.toBeInTheDocument();
    expect(
      within(dropdown).queryByText("MySQL legacy"),
    ).not.toBeInTheDocument();
  });

  it("should not allow submission without a database and at least one schema", async () => {
    setupCreate();

    expect(
      screen.getByRole("button", { name: /Add database/i }),
    ).toBeDisabled();

    await selectDatabase("Postgres prod");

    expect(
      screen.getByRole("button", { name: /Add database/i }),
    ).toBeDisabled();
  });

  it("should submit the selected database and schemas to the create endpoint", async () => {
    const { workspace, onClose } = setupCreate();

    await selectDatabase("Postgres prod");
    await selectSchemas(["public", "events"]);

    await userEvent.click(
      screen.getByRole("button", { name: /Add database/i }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const [request] = fetchMock.callHistory.calls(
      `path:/api/ee/workspace-manager/${workspace.id}/database`,
    );
    expect(request).toBeDefined();
    expect(await request.request?.json()).toEqual({
      database_id: 1,
      input_schemas: ["public", "events"],
    });
  });

  it("should clear selected schemas when the database is changed", async () => {
    const { workspace } = setupCreate();

    await selectDatabase("Postgres prod");
    await selectSchemas(["public"]);
    await selectDatabase("Postgres staging");
    await selectSchemas(["raw"]);

    await userEvent.click(
      screen.getByRole("button", { name: /Add database/i }),
    );

    const [request] = await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        `path:/api/ee/workspace-manager/${workspace.id}/database`,
      );
      expect(calls).toHaveLength(1);
      return calls;
    });
    expect(await request.request?.json()).toEqual({
      database_id: 2,
      input_schemas: ["raw"],
    });
  });

  it("should hide the schemas selector for databases without the schemas feature", async () => {
    setupCreate({
      workspace: createMockWorkspace({ id: 7, databases: [] }),
      databases: [
        createMockDatabase({
          id: 5,
          name: "MySQL prod",
          features: ["workspace"],
          tables: [],
        }),
      ],
    });

    await selectDatabase("MySQL prod");
    expect(screen.queryByLabelText("Readable schemas")).not.toBeInTheDocument();
  });
});

describe("UpdateDatabaseModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should prefill the form with the existing database and schemas", async () => {
    const { workspace } = setupUpdate({
      workspace: createMockWorkspace({
        id: 7,
        databases: [
          createMockWorkspaceDatabase({
            database_id: 1,
            input_schemas: ["public", "raw"],
          }),
        ],
      }),
    });

    await selectSchemas(["events"]);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    const [request] = await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        `path:/api/ee/workspace-manager/${workspace.id}/database/1`,
      );
      expect(calls).toHaveLength(1);
      return calls;
    });
    expect(await request.request?.json()).toEqual({
      input_schemas: ["public", "raw", "events"],
    });
  });

  it("should disable Save until the form is dirty", async () => {
    setupUpdate();

    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();

    await selectSchemas(["raw"]);

    expect(screen.getByRole("button", { name: /Save/i })).toBeEnabled();
  });

  it("should submit the updated schemas to the update endpoint", async () => {
    const { workspace, onClose } = setupUpdate();

    await selectSchemas(["events"]);

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const [request] = fetchMock.callHistory.calls(
      `path:/api/ee/workspace-manager/${workspace.id}/database/1`,
    );
    expect(request).toBeDefined();
    expect(request.options.method).toBe("PUT");
    expect(await request.request?.json()).toEqual({
      input_schemas: ["public", "events"],
    });
  });
});
