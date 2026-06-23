import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupDeleteWorkspaceEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { DeleteWorkspaceModal } from "./DeleteWorkspaceModal";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

const ORPHAN_MESSAGE =
  'Workspace 1 was deleted, but warehouse cleanup failed for 1 database(s). These resources were left in place and may need to be removed manually:\n  - database 2 (postgres): schema "mb_iso_1", user "mb_iso_1" — not removed because: Connection refused';

function setup({
  withError = false,
  withOrphans = false,
}: { withError?: boolean; withOrphans?: boolean } = {}) {
  if (withError) {
    setupDeleteWorkspaceEndpointError(WORKSPACE.id);
  } else if (withOrphans) {
    setupDeleteWorkspaceEndpoint(WORKSPACE.id, {
      message: ORPHAN_MESSAGE,
      orphaned_resources: [
        {
          workspace_database_id: 1,
          database_id: 2,
          driver: "postgres",
          schema: "mb_iso_1",
          user: "mb_iso_1",
          reason: "Connection refused",
        },
      ],
    });
  } else {
    setupDeleteWorkspaceEndpoint(WORKSPACE.id);
  }

  const onDelete = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <>
      <DeleteWorkspaceModal
        workspace={WORKSPACE}
        opened
        onDelete={onDelete}
        onClose={onClose}
      />
      <UndoListing />
    </>,
  );

  return { onDelete, onClose };
}

describe("DeleteWorkspaceModal", () => {
  it("should delete the workspace and call the callback when the confirm button is clicked", async () => {
    const { onDelete } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workspace" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}`,
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should warn about orphaned warehouse resources but still delete when teardown partly fails", async () => {
    const { onDelete } = setup({ withOrphans: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workspace" }),
    );

    expect(
      await screen.findByText(/warehouse cleanup failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should show an error message and not call the callback when the request fails", async () => {
    const { onDelete } = setup({ withError: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workspace" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An error occurred",
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
