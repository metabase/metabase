import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorktreeEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockRemoteSyncWorktree,
  createMockUser,
} from "metabase-types/api/mocks";

import { WorktreeMenu } from "./WorktreeMenu";

const WORKTREE = createMockRemoteSyncWorktree({ id: 10, branch: "feature/x" });

function setup({ worktreeId = null }: { worktreeId?: number | null } = {}) {
  const currentUser = createMockUser({ id: 1, worktree_id: worktreeId });
  setupUserEndpoints(currentUser);
  setupDeleteWorktreeEndpoint(WORKTREE.id);

  renderWithProviders(<WorktreeMenu worktree={WORKTREE} />, {
    storeInitialState: createMockState({ currentUser }),
  });
}

async function openMenu() {
  await userEvent.click(screen.getByLabelText("Worktree actions"));
}

describe("WorktreeMenu", () => {
  it("should show 'Enter worktree' and PUT worktree_id when the user is not a member", async () => {
    setup({ worktreeId: null });
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /enter worktree/i }),
    );

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
        method: "PUT",
      });
      expect(await call?.request?.json()).toEqual({ worktree_id: 10 });
    });
  });

  it("should show 'Leave worktree' and PUT worktree_id: null when the user is a member", async () => {
    setup({ worktreeId: 10 });
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /leave worktree/i }),
    );

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
        method: "PUT",
      });
      expect(await call?.request?.json()).toEqual({ worktree_id: null });
    });
  });

  it("should show a confirmation dialog before deleting a worktree", async () => {
    setup();
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: /delete this worktree/i }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/worktree/10", {
        method: "DELETE",
      }),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/remote-sync/worktree/10", {
          method: "DELETE",
        }),
      ).toHaveLength(1);
    });
  });
});
