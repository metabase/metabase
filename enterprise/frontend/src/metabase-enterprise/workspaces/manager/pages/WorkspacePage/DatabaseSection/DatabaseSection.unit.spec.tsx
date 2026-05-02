import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceDatabaseEndpoint,
  setupSchemaEndpoints,
} from "__support__/server-mocks";
import {
  getIcon,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseSection } from "./DatabaseSection";

function buildSupportedDatabase(opts: Partial<Database> = {}): Database {
  return createMockDatabase({
    features: ["workspace", "schemas"],
    tables: [createMockTable({ id: 1, db_id: opts.id ?? 1, schema: "public" })],
    ...opts,
  });
}

type SetupOpts = {
  workspace?: Workspace;
  databases?: Database[];
};

function setup({
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
}: SetupOpts = {}) {
  databases.forEach((database) => setupSchemaEndpoints(database));
  setupDeleteWorkspaceDatabaseEndpoint(workspace.id, 1, workspace);
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  return {
    workspace,
    ...renderWithProviders(
      <DatabaseSection workspace={workspace} databases={databases} />,
    ),
  };
}

describe("DatabaseSection", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should disable Add database when every supported database is already configured", async () => {
    setup({
      workspace: createMockWorkspace({
        id: 7,
        databases: [createMockWorkspaceDatabase({ database_id: 1 })],
      }),
      databases: [buildSupportedDatabase({ id: 1, name: "Postgres prod" })],
    });

    const button = screen.getByRole("button", { name: /Add database/i });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText("All supported databases are already added."),
    ).toBeInTheDocument();
  });

  it("should enable Add database when at least one supported database is unconfigured", () => {
    setup({
      workspace: createMockWorkspace({
        id: 7,
        databases: [],
      }),
      databases: [buildSupportedDatabase({ id: 1, name: "Postgres prod" })],
    });

    expect(screen.getByRole("button", { name: /Add database/i })).toBeEnabled();
  });

  it("should open the create modal when Add database is clicked", async () => {
    setup({
      workspace: createMockWorkspace({ id: 7, databases: [] }),
      databases: [buildSupportedDatabase({ id: 1, name: "Postgres prod" })],
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Add database/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: /Add database/i }),
    ).toBeInTheDocument();
  });

  it("should open the update modal when Edit is selected from the row menu", async () => {
    setup();

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Edit/i }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: /Edit database configuration/i,
      }),
    ).toBeInTheDocument();
  });

  it("should delete the database after the user confirms the removal", async () => {
    const { workspace } = setup();

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/i }),
    );

    expect(
      await screen.findByText(/Remove Postgres prod from this workspace\?/i),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        `path:/api/ee/workspace-manager/${workspace.id}/database/1`,
      ),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /^Remove$/i }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(
          `path:/api/ee/workspace-manager/${workspace.id}/database/1`,
        ),
      ).toHaveLength(1);
    });
    const [request] = fetchMock.callHistory.calls(
      `path:/api/ee/workspace-manager/${workspace.id}/database/1`,
    );
    expect(request.options.method).toBe("DELETE");
  });
});
