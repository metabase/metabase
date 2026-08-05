import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  type RemoteSyncExportPreflightResponse,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncEntity, Worktree } from "metabase-types/api";
import {
  createMockRemoteSyncEntity,
  createMockSettings,
  createMockUser,
  createMockWorktree,
} from "metabase-types/api/mocks";

import { WorktreesNavSection } from "./WorktreesNavSection";

type SetupOpts = {
  isAdmin?: boolean;
  isRemoteSyncEnabled?: boolean;
  worktrees?: Worktree[];
  isDirty?: boolean;
  hasRemoteChanges?: boolean;
  dirty?: RemoteSyncEntity[];
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
  syncType?: "read-only" | "read-write";
};

function setup({
  isAdmin = true,
  isRemoteSyncEnabled = true,
  worktrees = [],
  isDirty = false,
  hasRemoteChanges = false,
  dirty = [],
  exportPreflight,
  syncType = "read-write",
}: SetupOpts = {}) {
  setupRemoteSyncEndpoints({
    worktrees,
    isDirty,
    hasRemoteChanges,
    dirty,
    exportPreflight,
  });
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": isRemoteSyncEnabled,
      "remote-sync-type": syncType,
    }),
  );
  fetchMock.get("path:/api/ee/library", { data: null });
  fetchMock.get("path:/api/collection/tree", []);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "remote-sync-enabled": isRemoteSyncEnabled,
      "remote-sync-type": syncType,
    }),
  });

  renderWithProviders(<WorktreesNavSection isNavbarOpened />, {
    storeInitialState: state,
    withRouter: true,
  });
}

async function openWorktreeMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Worktree options" }),
  );
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

  it("offers pull, push, and delete from the worktree menu", async () => {
    setup({
      worktrees: [createMockWorktree()],
      isDirty: true,
      hasRemoteChanges: true,
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    const pullItem = await screen.findByRole("menuitem", {
      name: /Pull changes/,
    });
    await waitFor(() => expect(pullItem).toBeEnabled());
    expect(
      screen.getByRole("menuitem", { name: /Push changes/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("menuitem", { name: /Delete worktree/ }),
    ).toBeInTheDocument();
  });

  it("pulls the worktree's branch from the menu", async () => {
    setup({
      worktrees: [createMockWorktree({ id: 7, branch: "feature-branch" })],
      hasRemoteChanges: true,
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    const pullItem = await screen.findByRole("menuitem", {
      name: /Pull changes/,
    });
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    const request = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/import",
    )?.request;
    expect(await request?.json()).toEqual({
      branch: "feature-branch",
      expected_branch: "feature-branch",
      worktree_id: 7,
    });
  });

  it("opens the push modal and pushes with the worktree id when the remote has not advanced", async () => {
    setup({
      worktrees: [createMockWorktree({ id: 7, branch: "feature-branch" })],
      isDirty: true,
      dirty: [createMockRemoteSyncEntity({ model: "transform" })],
      exportPreflight: { has_changes: false },
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    const pushItem = await screen.findByRole("menuitem", {
      name: /Push changes/,
    });
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(await screen.findByText("Push to Git")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Push changes/ }));

    const request = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/export",
    )?.request;
    expect(await request?.json()).toEqual({
      branch: "feature-branch",
      worktree_id: 7,
    });
  });

  it("opens the conflict options without a new-branch option when the remote has advanced", async () => {
    setup({
      worktrees: [createMockWorktree()],
      isDirty: true,
      exportPreflight: { has_changes: true, clean: true },
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    const pushItem = await screen.findByRole("menuitem", {
      name: /Push changes/,
    });
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(
      await screen.findByText("Merge the remote changes with yours and push"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Create a new branch and push changes there"),
    ).not.toBeInTheDocument();
  });

  it("offers pull conflict options when pulling with local changes", async () => {
    setup({
      worktrees: [createMockWorktree()],
      isDirty: true,
      hasRemoteChanges: true,
      exportPreflight: { has_changes: true, clean: true },
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    const pullItem = await screen.findByRole("menuitem", {
      name: /Pull changes/,
    });
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    expect(
      await screen.findByText(
        "Merge the remote changes into your local content",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Delete unsynced changes (can’t be undone)"),
    ).toBeInTheDocument();
  });

  it("shows a dirty badge next to a worktree with uncommitted changes", async () => {
    setup({ worktrees: [createMockWorktree()], isDirty: true });
    await screen.findByText("feature-branch");

    expect(await screen.findByTestId("remote-sync-status")).toBeInTheDocument();
  });

  it("shows no dirty badge for a clean worktree", async () => {
    setup({ worktrees: [createMockWorktree()], isDirty: false });
    await screen.findByText("feature-branch");

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/is-dirty"),
      ).toBe(true);
    });
    expect(screen.queryByTestId("remote-sync-status")).not.toBeInTheDocument();
  });

  it("hides the push menu item when remote sync is read-only", async () => {
    setup({
      worktrees: [createMockWorktree()],
      isDirty: true,
      syncType: "read-only",
    });
    await screen.findByText("feature-branch");

    await openWorktreeMenu();

    await screen.findByRole("menuitem", { name: /Pull changes/ });
    expect(
      screen.queryByRole("menuitem", { name: /Push changes/ }),
    ).not.toBeInTheDocument();
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
