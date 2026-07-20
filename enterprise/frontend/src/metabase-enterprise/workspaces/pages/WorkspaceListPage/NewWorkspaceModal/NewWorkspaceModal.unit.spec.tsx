import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceEndpoint,
  setupListWorkspacesEndpoint,
  setupProvisionWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { NewWorkspaceModal } from "./NewWorkspaceModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

type SetupOpts = {
  createdWorkspace?: Workspace;
  databases?: Database[];
};

const DATABASE = createMockDatabase({ id: 10, name: "Postgres" });
const DATABASE_2 = createMockDatabase({ id: 20, name: "MySQL" });

function setup({
  createdWorkspace = createMockWorkspace({ name: "Brand new workspace" }),
  databases = [DATABASE, DATABASE_2],
}: SetupOpts = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();

  setupCreateWorkspaceEndpoint(createdWorkspace);
  setupProvisionWorkspaceEndpoint(createdWorkspace);
  setupListWorkspacesEndpoint([createdWorkspace]);

  renderWithProviders(
    <>
      <NewWorkspaceModal
        databases={databases}
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
    expect(
      fetchMock.callHistory.called(
        `path:/api/ee/workspace-manager/${createdWorkspace.id}/provision`,
        { method: "POST" },
      ),
    ).toBe(true);
  });

  it("fills the branch with the sluggified name until manually edited", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand New Workspace");
    expect(screen.getByLabelText("Branch")).toHaveValue("brand-new-workspace");
  });

  it("keeps a manually edited branch when the name changes", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Branch"), "custom-branch");
    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");

    expect(screen.getByLabelText("Branch")).toHaveValue("custom-branch");
  });

  it("sends the branch when creating a workspace", async () => {
    const { onCreate } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/workspace-manager",
      { method: "POST" },
    );
    expect(await call?.request?.json()).toMatchObject({
      target_branch: "brand-new-workspace",
    });
  });

  it("requires a branch", async () => {
    const { onCreate } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.clear(screen.getByLabelText("Branch"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("preselects the database when it is the only one available", async () => {
    const { onCreate, createdWorkspace } = setup({ databases: [DATABASE] });

    expect(screen.getByRole("checkbox", { name: "Postgres" })).toBeChecked();
    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(createdWorkspace),
    );
  });

  it("preselects nothing when several databases are available", () => {
    setup();

    expect(
      screen.getByRole("checkbox", { name: "Postgres" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "MySQL" })).not.toBeChecked();
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
