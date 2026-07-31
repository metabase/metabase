import userEvent from "@testing-library/user-event";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockRemoteSyncWorktree,
  createMockUser,
} from "metabase-types/api/mocks";

import { WorktreeSwitcher } from "./WorktreeSwitcher";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  worktrees = [],
  value = null,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  worktrees?: RemoteSyncWorktree[];
  value?: number | null;
} = {}) => {
  setupRemoteSyncEndpoints({ worktrees });

  const onChange = jest.fn();

  renderWithProviders(<WorktreeSwitcher value={value} onChange={onChange} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: mockSettings({
        "remote-sync-enabled": remoteSyncEnabled,
        "remote-sync-branch": "main",
        "remote-sync-type": "read-write",
      }),
    }),
  });

  return { onChange };
};

describe("WorktreeSwitcher", () => {
  it("does not render when there are no worktrees", async () => {
    setup();

    await waitFor(() => {
      expect(screen.queryByTestId("worktree-switcher")).not.toBeInTheDocument();
    });
  });

  it("does not render for non-admins", async () => {
    setup({ isAdmin: false, worktrees: [createMockRemoteSyncWorktree()] });

    await waitFor(() => {
      expect(screen.queryByTestId("worktree-switcher")).not.toBeInTheDocument();
    });
  });

  it("switches to a worktree", async () => {
    const { onChange } = setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(await screen.findByTestId("worktree-switcher"));
    await userEvent.click(await screen.findByText("feature-a"));

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("switches back to the main app", async () => {
    const { onChange } = setup({
      value: 5,
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(await screen.findByTestId("worktree-switcher"));
    await userEvent.click(await screen.findByText("Main"));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
