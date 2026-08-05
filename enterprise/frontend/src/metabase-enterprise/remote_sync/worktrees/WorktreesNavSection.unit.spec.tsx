import { setupRemoteSyncWorktreesEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Worktree } from "metabase-types/api";
import { createMockUser, createMockWorktree } from "metabase-types/api/mocks";

import { WorktreesNavSection } from "./WorktreesNavSection";

type SetupOpts = {
  isAdmin?: boolean;
  isRemoteSyncEnabled?: boolean;
  worktrees?: Worktree[];
};

function setup({
  isAdmin = true,
  isRemoteSyncEnabled = true,
  worktrees = [],
}: SetupOpts = {}) {
  setupRemoteSyncWorktreesEndpoint(worktrees);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({ "remote-sync-enabled": isRemoteSyncEnabled }),
  });

  renderWithProviders(<WorktreesNavSection isNavbarOpened />, {
    storeInitialState: state,
    withRouter: true,
  });
}

describe("WorktreesNavSection", () => {
  it("lists each worktree with a Transforms item linking into the worktree", async () => {
    setup({
      worktrees: [
        createMockWorktree({ id: 1, branch: "feature/customer-ltv" }),
        createMockWorktree({ id: 2, branch: "fix/warehouse-sync" }),
      ],
    });

    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(await screen.findByText("feature/customer-ltv")).toBeInTheDocument();
    expect(screen.getByText("fix/warehouse-sync")).toBeInTheDocument();

    const transformsLinks = screen.getAllByRole("link", {
      name: "Transforms",
    });
    expect(transformsLinks).toHaveLength(2);
    expect(transformsLinks[0]).toHaveAttribute(
      "href",
      "/data-studio/worktrees/1/transforms",
    );
    expect(transformsLinks[1]).toHaveAttribute(
      "href",
      "/data-studio/worktrees/2/transforms",
    );
  });

  it("shows a New worktree button", async () => {
    setup({ worktrees: [createMockWorktree()] });
    await screen.findByText("feature-branch");
    expect(
      screen.getByRole("button", { name: "New worktree" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when remote sync is disabled", async () => {
    setup({ isRemoteSyncEnabled: false, worktrees: [createMockWorktree()] });
    await waitFor(() => {
      expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
    });
  });

  it("renders nothing for non-admins", async () => {
    setup({ isAdmin: false, worktrees: [createMockWorktree()] });
    await waitFor(() => {
      expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
    });
  });
});
