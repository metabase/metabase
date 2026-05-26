import userEvent from "@testing-library/user-event";

import { setupCreateWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { NewWorkspaceModal } from "./NewWorkspaceModal";

type SetupOpts = {
  createdWorkspace?: Workspace;
};

function setup({
  createdWorkspace = createMockWorkspace({ name: "Brand new workspace" }),
}: SetupOpts = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();

  setupCreateWorkspaceEndpoint(createdWorkspace);

  renderWithProviders(
    <NewWorkspaceModal opened onCreate={onCreate} onClose={onClose} />,
  );

  return { onCreate, onClose, createdWorkspace };
}

describe("NewWorkspaceModal", () => {
  it("can create a workspace", async () => {
    const { onCreate, createdWorkspace } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
  });
});
