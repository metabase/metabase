import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupDeleteWorkspaceEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { DeleteWorkspaceModal } from "./DeleteWorkspaceModal";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup({ withError = false }: { withError?: boolean } = {}) {
  if (withError) {
    setupDeleteWorkspaceEndpointError(WORKSPACE.id);
  } else {
    setupDeleteWorkspaceEndpoint(WORKSPACE.id);
  }

  const onDelete = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <DeleteWorkspaceModal
      workspace={WORKSPACE}
      opened
      onDelete={onDelete}
      onClose={onClose}
    />,
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
