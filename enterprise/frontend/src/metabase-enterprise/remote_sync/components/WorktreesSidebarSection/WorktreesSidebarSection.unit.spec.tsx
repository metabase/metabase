import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import type { RemoteSyncExportPreflightResponse } from "__support__/server-mocks";
import {
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection, RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { WorktreesSidebarSection } from "./WorktreesSidebarSection";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  worktrees = [],
  collections = [],
  isDirty = false,
  hasRemoteChanges = false,
  exportPreflight,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  worktrees?: RemoteSyncWorktree[];
  collections?: Collection[];
  isDirty?: boolean;
  hasRemoteChanges?: boolean;
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
} = {}) => {
  setupRemoteSyncEndpoints({
    worktrees,
    isDirty,
    hasRemoteChanges,
    exportPreflight,
  });
  // The conflict modal fetches these when it opens.
  setupLibraryEndpoints();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": "main",
      "remote-sync-type": "read-write",
    }),
  );
  fetchMock.get("path:/api/collection/tree", collections);
  // The new-collection form looks up a default parent even with its picker hidden.
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root" }),
  );
  fetchMock.get("express:/api/collection/:id", createMockCollection({ id: 1 }));

  const onItemSelect = jest.fn();

  const { store } = renderWithProviders(
    <WorktreesSidebarSection onItemSelect={onItemSelect} />,
    {
      withRouter: true,
      withDND: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings({
          "remote-sync-enabled": remoteSyncEnabled,
          "remote-sync-branch": "main",
          "remote-sync-type": "read-write",
        }),
      }),
    },
  );

  return { onItemSelect, store };
};

describe("WorktreesSidebarSection", () => {
  it("does not render for non-admins", async () => {
    setup({ isAdmin: false, worktrees: [createMockRemoteSyncWorktree()] });

    await waitFor(() => {
      expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
    });
  });

  it("does not render when remote sync is disabled", async () => {
    setup({
      remoteSyncEnabled: false,
      worktrees: [createMockRemoteSyncWorktree()],
    });

    await waitFor(() => {
      expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
    });
  });

  it("lists worktrees by branch name", async () => {
    setup({
      worktrees: [
        createMockRemoteSyncWorktree({ id: 1, branch: "feature-a" }),
        createMockRemoteSyncWorktree({ id: 2, branch: "feature-b" }),
      ],
    });

    expect(await screen.findByText("feature-a")).toBeInTheDocument();
    expect(screen.getByText("feature-b")).toBeInTheDocument();
  });

  it("shows an empty state when there are no worktrees", async () => {
    setup();

    expect(await screen.findByText("No worktrees yet")).toBeInTheDocument();
  });

  it("lazily loads a worktree's collections on expand", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 1, branch: "feature-a" })],
      collections: [
        createMockCollection({
          id: 10,
          name: "Checked out collection",
          worktree_id: 1,
        }),
      ],
    });

    await screen.findByText("feature-a");
    expect(fetchMock.callHistory.called("path:/api/collection/tree")).toBe(
      false,
    );
    expect(
      screen.queryByText("Checked out collection"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("treeitem", { name: /feature-a/ }));

    expect(
      await screen.findByText("Checked out collection"),
    ).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/collection/tree");
    expect(call?.url).toContain("worktree-id=1");
  });

  it("pulls a worktree's branch from its menu", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
      hasRemoteChanges: true,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
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

    const body = await fetchMock.callHistory
      .lastCall("path:/api/ee/remote-sync/import")
      ?.request?.json();
    expect(body).toMatchObject({
      branch: "feature-a",
      expected_branch: "feature-a",
      worktree_id: 7,
    });
  });

  it("shows a dirty badge on a worktree with unsynced changes", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
      isDirty: true,
    });

    expect(await screen.findByTestId("remote-sync-status")).toBeInTheDocument();
  });

  it("shows no dirty badge on a clean worktree", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
    });

    await screen.findByText("feature-a");
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/is-dirty"),
      ).toBe(true);
    });
    expect(screen.queryByTestId("remote-sync-status")).not.toBeInTheDocument();
  });

  it("disables Pull when the branch has nothing new and Push when the worktree is clean", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );

    const pullItem = await screen.findByRole("menuitem", {
      name: /Pull changes/,
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/remote-sync/has-remote-changes",
        ),
      ).toBe(true);
    });
    await waitFor(() => expect(pullItem).toBeDisabled());
    expect(
      screen.getByRole("menuitem", { name: /Push changes/ }),
    ).toBeDisabled();
  });

  it("opens the conflict modal instead of pulling when the worktree is dirty", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
      isDirty: true,
      hasRemoteChanges: true,
      exportPreflight: { has_changes: true, clean: true },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
    const pullItem = await screen.findByRole("menuitem", {
      name: /Pull changes/,
    });
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    expect(
      await screen.findByText("Choose how to proceed:"),
    ).toBeInTheDocument();
    // A worktree is pinned to its branch, so stashing to a new branch isn't offered.
    expect(screen.queryByText(/Create a new branch/)).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
    ).toBe(false);

    const preflightCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/export-preflight",
    );
    expect(preflightCall?.url).toContain("worktree-id=7");
  });

  it("opens the conflict modal when pushing while the branch has advanced", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
      isDirty: true,
      exportPreflight: { has_changes: true, clean: true },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
    const pushItem = await screen.findByRole("menuitem", {
      name: /Push changes/,
    });
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(
      await screen.findByText("Choose how to proceed:"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Push to Git")).not.toBeInTheDocument();
  });

  it("opens the plain push modal when the branch has not advanced", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
      isDirty: true,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
    const pushItem = await screen.findByRole("menuitem", {
      name: /Push changes/,
    });
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(await screen.findByText("Push to Git")).toBeInTheDocument();
  });

  it("creates a collection at the worktree root from its menu", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /New collection/ }),
    );
    await userEvent.type(await screen.findByLabelText(/Name/), "My folder");
    await userEvent.type(
      await screen.findByLabelText(/Description/),
      "A place for things",
    );
    // The location picker is not offered: the collection goes to the worktree root.
    expect(
      screen.queryByText("Collection it's saved in"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "express:/api/ee/remote-sync/worktree/:id/collection",
        ),
      ).toBe(true);
    });

    const call = fetchMock.callHistory.lastCall(
      "express:/api/ee/remote-sync/worktree/:id/collection",
    );
    expect(call?.url).toContain("/worktree/7/collection");
    expect(await call?.request?.json()).toEqual({
      name: "My folder",
      description: "A place for things",
      authority_level: null,
    });
  });

  it("deletes a worktree after confirmation", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Worktree actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete worktree/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete worktree" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "express:/api/ee/remote-sync/worktree/:id",
        ),
      ).toBe(true);
    });
  });

  it("creates a worktree for an existing branch", async () => {
    setup({ worktrees: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a new worktree" }),
    );
    await userEvent.type(await screen.findByLabelText("Branch"), "develop");
    await userEvent.click(
      screen.getByRole("button", { name: "Create worktree" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/worktree", {
          method: "POST",
        }),
      ).toBe(true);
    });

    const body = await fetchMock.callHistory
      .lastCall("path:/api/ee/remote-sync/worktree", { method: "POST" })
      ?.request?.json();
    expect(body).toEqual({ branch: "develop" });

    // Creation immediately pulls the branch's content into the new worktree.
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    const importBody = await fetchMock.callHistory
      .lastCall("path:/api/ee/remote-sync/import")
      ?.request?.json();
    expect(importBody).toEqual({
      branch: "develop",
      expected_branch: "develop",
      worktree_id: 1,
    });
  });

  it("toasts when the pull into a freshly created worktree fails", async () => {
    // The toaster (UndoListing) isn't mounted in this harness, so assert the dispatched
    // toast via the undo store rather than the DOM.
    const { store } = setup({ worktrees: [] });

    fetchMock.removeRoute("remote-sync-import");
    fetchMock.post(
      "path:/api/ee/remote-sync/import",
      { status: 500, body: { message: "boom" } },
      { name: "remote-sync-import" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a new worktree" }),
    );
    await userEvent.type(await screen.findByLabelText("Branch"), "develop");
    await userEvent.click(
      screen.getByRole("button", { name: "Create worktree" }),
    );

    await waitFor(() => {
      const messages = store
        .getState()
        .undo.map((undo) => String(undo.message));
      expect(messages.some((m) => /boom/.test(m))).toBe(true);
    });
  });
});
