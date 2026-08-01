import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { RemoteSyncExportPreflightResponse } from "__support__/server-mocks";
import {
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import {
  syncConflictVariantUpdated,
  taskStarted,
  taskUpdated,
} from "metabase-enterprise/remote_sync/sync-task-slice";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../../scope";

import { ContentStudioSyncControls } from "./SyncControls";

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });

type SetupOpts = {
  initialRoute?: string;
  worktrees?: RemoteSyncWorktree[];
  isDirty?: boolean;
  hasRemoteChanges?: boolean;
  hasRemoteChangesError?: boolean;
  isBranchMissing?: boolean;
  isReadOnly?: boolean;
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
};

function setup({
  initialRoute = "/content-studio/collections?worktree=7",
  worktrees = [WORKTREE],
  isDirty = false,
  hasRemoteChanges = false,
  hasRemoteChangesError = false,
  isBranchMissing = false,
  isReadOnly = false,
  exportPreflight,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": isReadOnly ? "read-only" : "read-write",
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupRemoteSyncEndpoints({
    worktrees,
    isDirty,
    hasRemoteChanges,
    hasRemoteChangesError,
    isBranchMissing,
    exportPreflight,
  });
  // The conflict modal fetches these when it opens.
  setupLibraryEndpoints();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  fetchMock.get("express:/api/collection/:id", createMockCollection({ id: 1 }));

  setupEnterpriseOnlyPlugin("remote_sync");

  const { store } = renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route
          path="collections"
          element={<ContentStudioSyncControls isNavbarOpened />}
        />
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
    },
  );

  return { store };
}

async function openMenu() {
  return userEvent.click(await screen.findByRole("button", { name: "Sync" }));
}

async function findPullItem() {
  return screen.findByRole("menuitem", { name: /Pull changes/ });
}

async function findPushItem() {
  return screen.findByRole("menuitem", { name: /Push changes/ });
}

function getImportBody() {
  return fetchMock.callHistory
    .lastCall("path:/api/ee/remote-sync/import")
    ?.request?.json();
}

describe("ContentStudioSyncControls", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows an unsynced-changes indicator for the branch on screen", async () => {
    setup({ isDirty: true });

    expect(await screen.findByTestId("remote-sync-status")).toBeInTheDocument();
  });

  it("shows no indicator when the branch is clean", async () => {
    setup();

    await screen.findByRole("button", { name: "Sync" });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/is-dirty"),
      ).toBe(true);
    });
    expect(screen.queryByTestId("remote-sync-status")).not.toBeInTheDocument();
  });

  it("only checks the remote once the menu is opened", async () => {
    setup();

    await screen.findByRole("button", { name: "Sync" });
    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/remote-sync/has-remote-changes",
      ),
    ).toBe(false);

    await openMenu();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/remote-sync/has-remote-changes",
        ),
      ).toBe(true);
    });
  });

  it("disables Pull when the remote has nothing new and Push when the branch is clean", async () => {
    setup();

    await openMenu();

    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeDisabled());
    expect(await findPushItem()).toBeDisabled();
  });

  it("keeps Pull available when the remote check itself fails", async () => {
    setup({ hasRemoteChangesError: true });

    await openMenu();

    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
  });

  it("disables Pull when the branch is gone from the remote", async () => {
    setup({ hasRemoteChanges: true, isBranchMissing: true });

    await openMenu();

    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeDisabled());
  });

  it("pulls the branch on screen", async () => {
    setup({ hasRemoteChanges: true });

    await openMenu();
    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    expect(await getImportBody()).toEqual({
      branch: "feature-a",
      expected_branch: "feature-a",
      worktree_id: 7,
    });
  });

  it("pulls the main branch when no branch is checked out", async () => {
    setup({
      initialRoute: "/content-studio/collections",
      hasRemoteChanges: true,
    });

    await openMenu();
    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    expect(await getImportBody()).toEqual({
      branch: "main",
      expected_branch: "main",
    });

    const changesCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/has-remote-changes",
    );
    expect(changesCall?.url).not.toContain("worktree-id");
  });

  it("prompts a refresh when the branch changed in another session", async () => {
    setup({ hasRemoteChanges: true });
    fetchMock.removeRoute("remote-sync-import");
    fetchMock.post(
      "path:/api/ee/remote-sync/import",
      {
        status: 409,
        body: {
          branch_mismatch: true,
          current_branch: "other",
          message: "The sync branch changed to 'other' in another session.",
        },
      },
      { name: "remote-sync-import" },
    );

    await openMenu();
    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    expect(
      await screen.findByText("This view is out of date"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The sync branch changed to 'other' in another session.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("opens the conflict modal instead of pulling when the branch is dirty", async () => {
    setup({
      isDirty: true,
      hasRemoteChanges: true,
      exportPreflight: { has_changes: true, clean: true },
    });

    await openMenu();
    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    expect(
      await screen.findByText("Choose how to proceed:"),
    ).toBeInTheDocument();
    // A checked-out branch is pinned, so stashing to a new branch isn't offered.
    expect(screen.queryByText(/Create a new branch/)).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
    ).toBe(false);

    const preflightCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/export-preflight",
    );
    expect(preflightCall?.url).toContain("worktree-id=7");
  });

  it("opens the conflict modal when pushing while the remote has advanced", async () => {
    setup({
      isDirty: true,
      exportPreflight: { has_changes: true, clean: true },
    });

    await openMenu();
    const pushItem = await findPushItem();
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(
      await screen.findByText("Choose how to proceed:"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Push to Git")).not.toBeInTheDocument();
  });

  it("opens the plain push modal when the remote has not advanced", async () => {
    setup({ isDirty: true });

    await openMenu();
    const pushItem = await findPushItem();
    await waitFor(() => expect(pushItem).toBeEnabled());
    await userEvent.click(pushItem);

    expect(await screen.findByText("Push to Git")).toBeInTheDocument();
  });

  it("offers pull only on a read-only instance", async () => {
    setup({ initialRoute: "/content-studio/collections", isReadOnly: true });

    await openMenu();

    const menu = within(await screen.findByRole("menu"));
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Pull changes"]);
    expect(
      screen.getByText(
        "This instance is read-only. Content is pulled from main, not pushed back.",
      ),
    ).toBeInTheDocument();
  });

  it("toasts when the mergeability check fails on a dirty pull", async () => {
    const { store } = setup({ isDirty: true, hasRemoteChanges: true });
    fetchMock.removeRoute("remote-sync-export-preflight");
    fetchMock.get(
      "path:/api/ee/remote-sync/export-preflight",
      { status: 500, body: { message: "boom" } },
      { name: "remote-sync-export-preflight" },
    );

    await openMenu();
    const pullItem = await findPullItem();
    await waitFor(() => expect(pullItem).toBeEnabled());
    await userEvent.click(pullItem);

    // The toaster isn't mounted in this harness, so assert the dispatched toast via the undo store.
    await waitFor(() => {
      const messages = store
        .getState()
        .undo.map((undo) => String(undo.message));
      expect(
        messages.some((message) =>
          /Couldn't check whether your changes can be merged/i.test(message),
        ),
      ).toBe(true);
    });
    expect(
      await screen.findByText("Choose how to proceed:"),
    ).toBeInTheDocument();
  });

  it("toasts when an export task comes back in conflict", async () => {
    const { store } = setup();

    await screen.findByRole("button", { name: "Sync" });
    // What the middleware dispatches when a push loses the preflight/execute race.
    act(() => {
      store.dispatch(
        taskUpdated({
          id: 77,
          sync_task_type: "export",
          status: "conflict",
          progress: 1,
          started_at: "2026-01-01T00:00:00Z",
          ended_at: "2026-01-01T00:00:01Z",
          last_progress_report_at: null,
          error_message: null,
          initiated_by: 0,
        }),
      );
    });

    await waitFor(() => {
      const messages = store
        .getState()
        .undo.map((undo) => String(undo.message));
      expect(
        messages.some((message) => /changed before your push/i.test(message)),
      ).toBe(true);
    });
  });

  it("opens the conflict modal when a sync task ends in conflict", async () => {
    const { store } = setup({ initialRoute: "/content-studio/collections" });

    await screen.findByRole("button", { name: "Sync" });
    act(() => {
      store.dispatch(syncConflictVariantUpdated("setup"));
    });

    expect(
      await screen.findByText(
        /Your local data will be overwritten by the remote branch/,
      ),
    ).toBeInTheDocument();
  });

  it("ignores a task conflict while a branch is checked out", async () => {
    const { store } = setup();

    await screen.findByRole("button", { name: "Sync" });
    act(() => {
      store.dispatch(syncConflictVariantUpdated("setup"));
    });

    expect(
      screen.queryByText(
        /Your local data will be overwritten by the remote branch/,
      ),
    ).not.toBeInTheDocument();
  });

  it("disables every action while a sync runs", async () => {
    const { store } = setup({ isDirty: true, hasRemoteChanges: true });

    await openMenu();
    await findPullItem();
    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 7 }));
    });

    const items = within(await screen.findByRole("menu")).getAllByRole(
      "menuitem",
    );
    items.forEach((item) => expect(item).toBeDisabled());
  });
});
