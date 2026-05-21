import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceDatabaseEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { AddDatabaseButton } from "./AddDatabaseButton";

const POSTGRES_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas", "workspace"],
});

const MYSQL_DATABASE = createMockDatabase({
  id: 20,
  name: "MySQL",
  features: ["workspace"],
});

const UNSUPPORTED_DATABASE = createMockDatabase({
  id: 30,
  name: "Unsupported",
  features: ["schemas"],
});

type SetupOpts = {
  workspace?: Workspace;
  availableDatabases?: Database[];
};

function setup({
  workspace = createMockWorkspace(),
  availableDatabases = [POSTGRES_DATABASE],
}: SetupOpts = {}) {
  setupDatabasesEndpoints(availableDatabases);
  setupCreateWorkspaceDatabaseEndpoint(createMockWorkspace());

  renderWithProviders(
    <AddDatabaseButton
      workspace={workspace}
      availableDatabases={availableDatabases}
    />,
  );
}

describe("AddDatabaseButton", () => {
  it("disables the button when all available databases are already used", async () => {
    const workspace = createMockWorkspace({
      databases: [
        createMockWorkspaceDatabase({ database_id: POSTGRES_DATABASE.id }),
        createMockWorkspaceDatabase({ database_id: MYSQL_DATABASE.id }),
      ],
    });
    setup({
      workspace,
      availableDatabases: [POSTGRES_DATABASE, MYSQL_DATABASE],
    });

    const button = screen.getByRole("button", { name: /Add another database/ });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText("There are no more databases available."),
    ).toBeInTheDocument();
  });

  it("disables the button when all unused databases do not support workspaces", async () => {
    const workspace = createMockWorkspace({
      databases: [
        createMockWorkspaceDatabase({ database_id: POSTGRES_DATABASE.id }),
      ],
    });
    setup({
      workspace,
      availableDatabases: [POSTGRES_DATABASE, UNSUPPORTED_DATABASE],
    });

    const button = screen.getByRole("button", { name: /Add another database/ });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "None of the remaining databases support workspaces.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the button when there are no databases at all", async () => {
    setup({ availableDatabases: [] });

    const button = screen.getByRole("button", { name: /Add database/ });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText("There are no databases available."),
    ).toBeInTheDocument();
  });
});
