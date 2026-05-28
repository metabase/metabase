import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceDatabaseEndpoint,
  setupDeleteWorkspaceDatabaseEndpointError,
  setupGetWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DeleteDatabaseModal } from "./DeleteDatabaseModal";

const DATABASE = createMockDatabase({ id: 10, name: "Postgres" });

const WORKSPACE_DATABASE = createMockWorkspaceDatabase({
  database_id: DATABASE.id,
  input_schemas: ["public"],
});

const WORKSPACE = createMockWorkspace({
  id: 1,
  databases: [WORKSPACE_DATABASE],
});

function setup({ withError = false }: { withError?: boolean } = {}) {
  if (withError) {
    setupDeleteWorkspaceDatabaseEndpointError(WORKSPACE.id, DATABASE.id);
  } else {
    setupDeleteWorkspaceDatabaseEndpoint(WORKSPACE, DATABASE.id);
  }
  setupGetWorkspaceEndpoint(WORKSPACE);

  const onDelete = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <DeleteDatabaseModal
      workspace={WORKSPACE}
      workspaceDatabase={WORKSPACE_DATABASE}
      database={DATABASE}
      opened
      onDelete={onDelete}
      onClose={onClose}
    />,
  );

  return { onDelete, onClose };
}

describe("DeleteDatabaseModal", () => {
  it("should delete the workspace database and call the callback when the confirm button is clicked", async () => {
    const { onDelete } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}/database/${DATABASE.id}`,
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should show an error message and not call the callback when the request fails", async () => {
    const { onDelete } = setup({ withError: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An error occurred",
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
