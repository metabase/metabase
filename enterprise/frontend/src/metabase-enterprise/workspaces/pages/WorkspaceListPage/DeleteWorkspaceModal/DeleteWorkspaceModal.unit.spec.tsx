import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupDeleteWorkspaceEndpointError,
  setupGetWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DeleteWorkspaceModal } from "./DeleteWorkspaceModal";

const ORPHAN_MESSAGE =
  'Workspace 1 was deleted, but warehouse cleanup failed for 1 database(s). These resources were left in place and may need to be removed manually:\n  - database 2 (postgres): schema "mb_iso_1", user "mb_iso_1" — not removed because: Connection refused';

function setup({
  withError = false,
  withOrphans = false,
  databases = [],
}: {
  withError?: boolean;
  withOrphans?: boolean;
  databases?: WorkspaceDatabase[];
} = {}) {
  const workspace = createMockWorkspace({
    id: 1,
    name: "My workspace",
    databases,
  });
  setupGetWorkspaceEndpoint(workspace);

  if (withError) {
    setupDeleteWorkspaceEndpointError(workspace.id);
  } else if (withOrphans) {
    setupDeleteWorkspaceEndpoint(workspace.id, {
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
    setupDeleteWorkspaceEndpoint(workspace.id);
  }

  const onDelete = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <>
      <DeleteWorkspaceModal
        workspace={workspace}
        opened
        onDelete={onDelete}
        onClose={onClose}
      />
      <UndoListing />
    </>,
  );

  return { workspace, onDelete, onClose };
}

async function clickDelete() {
  const button = await screen.findByRole("button", {
    name: "Delete workspace",
  });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

describe("DeleteWorkspaceModal", () => {
  it("should delete the workspace and call the callback when the confirm button is clicked", async () => {
    const { onDelete } = setup();

    await clickDelete();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/workspace-manager/1", {
          method: "DELETE",
        }),
      ).toBe(true);
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should list pending databases and delete with ignore-pending when confirmed", async () => {
    const { onDelete } = setup({
      databases: [
        createMockWorkspaceDatabase({
          database_id: 7,
          status: "provisioning",
          database: createMockDatabase({ id: 7, name: "Pending DB" }),
        }),
      ],
    });

    expect(
      await screen.findByText(/still being set up or torn down/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending DB")).toBeInTheDocument();

    await clickDelete();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/workspace-manager/1", {
          method: "DELETE",
          query: { "ignore-pending": "true" },
        }),
      ).toBe(true);
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should warn about orphaned warehouse resources but still delete when teardown partly fails", async () => {
    const { onDelete } = setup({ withOrphans: true });

    await clickDelete();

    expect(
      await screen.findByText(/warehouse cleanup failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("should show an error message and not call the callback when the request fails", async () => {
    const { onDelete } = setup({ withError: true });

    await clickDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An error occurred",
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
