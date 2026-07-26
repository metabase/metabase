import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser, createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceMenu } from "./WorkspaceMenu";

const WORKSPACE = createMockWorkspace({ id: 10, branch: "feature/x" });

function setup({ workspaceId = null }: { workspaceId?: number | null } = {}) {
  const currentUser = createMockUser({ id: 1, workspace_id: workspaceId });
  setupUserEndpoints(currentUser);
  setupDeleteWorkspaceEndpoint(WORKSPACE.id);

  renderWithProviders(<WorkspaceMenu workspace={WORKSPACE} />, {
    storeInitialState: createMockState({ currentUser }),
  });
}

async function openMenu() {
  await userEvent.click(screen.getByLabelText("Workspace actions"));
}

describe("WorkspaceMenu", () => {
  it("should show 'Enter workspace' and PUT workspace_id when the user is not a member", async () => {
    setup({ workspaceId: null });
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /enter workspace/i }),
    );

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
        method: "PUT",
      });
      expect(await call?.request?.json()).toEqual({ workspace_id: 10 });
    });
  });

  it("should show 'Leave workspace' and PUT workspace_id: null when the user is a member", async () => {
    setup({ workspaceId: 10 });
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /leave workspace/i }),
    );

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
        method: "PUT",
      });
      expect(await call?.request?.json()).toEqual({ workspace_id: null });
    });
  });

  it("should show a confirmation dialog before deleting a workspace", async () => {
    setup();
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: /delete this workspace/i }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/workspace/10", {
        method: "DELETE",
      }),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/remote-sync/workspace/10", {
          method: "DELETE",
        }),
      ).toHaveLength(1);
    });
  });
});
