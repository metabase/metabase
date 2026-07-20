import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUpdateWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { RenameWorkspaceModal } from "./RenameWorkspaceModal";

const WORKSPACE = createMockWorkspace({ id: 1, name: "Old name" });

function setup() {
  setupUpdateWorkspaceEndpoint(WORKSPACE);

  const onRename = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <RenameWorkspaceModal
      workspace={WORKSPACE}
      opened
      onRename={onRename}
      onClose={onClose}
    />,
  );

  return { onRename, onClose };
}

describe("RenameWorkspaceModal", () => {
  it("prefills the current name and submits the new one", async () => {
    const { onRename } = setup();

    const input = screen.getByLabelText("Name");
    expect(input).toHaveValue("Old name");

    await userEvent.clear(input);
    await userEvent.type(input, "New name");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(onRename).toHaveBeenCalled();
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/ee/workspace-manager/1`,
    );
    expect(await call?.request?.json()).toEqual({ name: "New name" });
  });

  it("closes without renaming on Cancel", async () => {
    const { onRename, onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onRename).not.toHaveBeenCalled();
  });
});
