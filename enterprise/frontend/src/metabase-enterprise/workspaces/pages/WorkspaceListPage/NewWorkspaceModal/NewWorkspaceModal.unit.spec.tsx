import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceEndpoint,
  setupListWorkspaceInstancesEndpoint,
  setupListWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
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
  setupListWorkspaceInstancesEndpoint([]);

  renderWithProviders(
    <NewWorkspaceModal
      databases={[DATABASE]}
      opened
      onCreate={onCreate}
      onClose={onClose}
    />,
  );

  return { onCreate, onClose, createdWorkspace };
}

describe("NewWorkspaceModal", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("can create a workspace without picking databases", async () => {
    const { onCreate, createdWorkspace } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/workspace-manager",
      { method: "POST" },
    );
    expect(await call?.request?.json()).toEqual({
      name: "Brand new workspace",
    });
  });

  it("lists the databases that will be added", () => {
    setup();

    const databasesSection = screen.getByRole("group", { name: "Databases" });
    expect(
      within(databasesSection).getByText(
        "Every database with workspaces enabled will be added to this workspace.",
      ),
    ).toBeInTheDocument();
    expect(within(databasesSection).getByText("Postgres")).toBeInTheDocument();
  });

  it("tracks an analytics event when a workspace is created", async () => {
    const { createdWorkspace } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
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
