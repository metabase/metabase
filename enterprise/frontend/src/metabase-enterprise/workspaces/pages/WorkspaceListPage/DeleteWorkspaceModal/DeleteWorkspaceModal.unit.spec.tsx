import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupDeleteWorkspaceEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { WorkspaceId } from "metabase-types/api";

import { DeleteWorkspaceModal } from "./DeleteWorkspaceModal";

const WORKSPACE_ID: WorkspaceId = 1;

function setup({ withError = false }: { withError?: boolean } = {}) {
  if (withError) {
    setupDeleteWorkspaceEndpointError(WORKSPACE_ID);
  } else {
    setupDeleteWorkspaceEndpoint(WORKSPACE_ID);
  }

  const onDelete = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <>
      <DeleteWorkspaceModal
        workspaceId={WORKSPACE_ID}
        onDelete={onDelete}
        onClose={onClose}
      />
      <UndoListing />
    </>,
  );

  return { onDelete, onClose };
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

  it("should show an error message and not call the callback when the request fails", async () => {
    const { onDelete } = setup({ withError: true });

    await clickDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An error occurred",
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
