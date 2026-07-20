import userEvent from "@testing-library/user-event";

import {
  setupCreateWorkspaceEndpoint,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { NewWorkspaceModal } from "./NewWorkspaceModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

type SetupOpts = {
  createdWorkspace?: Workspace;
};

const DATABASE = createMockDatabase({ id: 10, name: "Postgres" });

function setup({
  createdWorkspace = createMockWorkspace({ name: "Brand new workspace" }),
}: SetupOpts = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();

  setupCreateWorkspaceEndpoint(createdWorkspace);
  setupListWorkspacesEndpoint([createdWorkspace]);

  renderWithProviders(
    <>
      <NewWorkspaceModal
        databases={[DATABASE]}
        opened
        onCreate={onCreate}
        onClose={onClose}
      />
      <UndoListing />
    </>,
  );

  return { onCreate, onClose, createdWorkspace };
}

describe("NewWorkspaceModal", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("can create a workspace", async () => {
    const { onCreate, createdWorkspace } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
  });

  it("warns when some databases could not be provisioned", async () => {
    const { onCreate } = setup({
      createdWorkspace: createMockWorkspace({
        name: "Brand new workspace",
        databases: [
          createMockWorkspaceDatabase({
            database_id: 10,
            status: "unprovisioned",
            database: createMockDatabase({ id: 10, name: "Postgres" }),
          }),
        ],
      }),
    });

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    expect(
      await screen.findByText("Failed to provision the workspace."),
    ).toBeInTheDocument();
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
  });

  it("requires at least one database", async () => {
    const { onCreate } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("tracks an analytics event when a workspace is created", async () => {
    const { createdWorkspace } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "workspaces_new_created",
        target_id: createdWorkspace.id,
      }),
    );
  });
});
