import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  type RemoteSyncExportPreflightResponse,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncEntity, RemoteSyncTask } from "metabase-types/api";
import {
  createMockRemoteSyncEntity,
  createMockRemoteSyncTask,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockWorktree,
} from "metabase-types/api/mocks";

import { WorktreeHomePage } from "./WorktreeHomePage";

const WORKTREE = createMockWorktree({
  id: 7,
  branch: "feature/customer-ltv",
  created_at: "2026-01-05T10:00:00Z",
});

type SetupOpts = {
  dirty?: RemoteSyncEntity[];
  hasRemoteChanges?: boolean;
  lastTask?: RemoteSyncTask | null;
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
  syncType?: "read-only" | "read-write";
};

function setup({
  dirty = [],
  hasRemoteChanges = false,
  lastTask = null,
  exportPreflight,
  syncType = "read-write",
}: SetupOpts = {}) {
  setupRemoteSyncEndpoints({
    worktrees: [WORKTREE],
    dirty,
    isDirty: dirty.length > 0,
    hasRemoteChanges,
    exportPreflight,
  });
  fetchMock.removeRoute("remote-sync-current-task");
  fetchMock.get("path:/api/ee/remote-sync/current-task", lastTask ?? 204);
  fetchMock.get(`path:/api/ee/remote-sync/worktree/${WORKTREE.id}`, WORKTREE);
  fetchMock.get("path:/api/collection/tree", []);
  setupSettingsEndpoints([]);

  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-type": syncType,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });
  setupPropertiesEndpoints(settings);
  const settingsState = mockSettings(settings);
  setupEnterprisePlugins();

  renderWithProviders(
    <WorktreeProvider worktreeId={WORKTREE.id}>
      <WorktreeHomePage />
    </WorktreeProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: settingsState,
      }),
      withRouter: true,
    },
  );
}

describe("WorktreeHomePage", () => {
  it("shows the branch, breadcrumb and an in-sync state for a clean worktree", async () => {
    setup();

    expect(await screen.findByTestId("worktree-home-title")).toHaveTextContent(
      "feature/customer-ltv",
    );
    expect(screen.getByTestId("worktree-breadcrumb")).toHaveAttribute(
      "href",
      "/data-studio/worktrees/7",
    );

    expect(
      await screen.findByText("Everything is in sync"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("worktree-local-changes")).getByText(
        "Nothing to push",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Push changes/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pull changes/ })).toBeDisabled();
  });

  it("lists dirty entities grouped with their change type and worktree-scoped links", async () => {
    setup({
      dirty: [
        createMockRemoteSyncEntity({
          id: 55,
          model: "transform",
          name: "Customer LTV",
          sync_status: "create",
        }),
        createMockRemoteSyncEntity({
          id: 56,
          model: "transform",
          name: "Orders cleanup",
          sync_status: "update",
        }),
        createMockRemoteSyncEntity({
          id: 57,
          model: "transform",
          name: "Old rollup",
          sync_status: "delete",
        }),
      ],
    });

    const rows = await screen.findAllByTestId("worktree-change-row");
    expect(rows).toHaveLength(3);

    const addedRow = rows.find((row) =>
      within(row).queryByText("Customer LTV"),
    );
    expect(addedRow).toBeDefined();
    expect(within(addedRow!).getByText("Added")).toBeInTheDocument();
    expect(
      within(addedRow!).getByRole("link", { name: /Customer LTV/ }),
    ).toHaveAttribute("href", "/data-studio/worktrees/7/transforms/55");

    const removedRow = rows.find((row) =>
      within(row).queryByText("Old rollup"),
    );
    expect(within(removedRow!).getByText("Removed")).toBeInTheDocument();
    expect(within(removedRow!).queryByRole("link")).not.toBeInTheDocument();

    const localChanges = screen.getByTestId("worktree-local-changes");
    expect(within(localChanges).getByText("3")).toBeInTheDocument();
    expect(
      within(localChanges).getByText("changes to push"),
    ).toBeInTheDocument();

    expect(screen.getByText("Transforms")).toBeInTheDocument();
  });

  it("describes the last completed sync", async () => {
    setup({
      lastTask: createMockRemoteSyncTask({
        worktree_id: WORKTREE.id,
        sync_task_type: "export",
        status: "successful",
        ended_at: "2026-02-01T12:00:00Z",
        outcome: { kind: "pushed", count: 3, branch: WORKTREE.branch },
      }),
    });

    const lastSync = await screen.findByTestId("worktree-last-sync");
    expect(
      await within(lastSync).findByText("Pushed 3 items"),
    ).toBeInTheDocument();
  });

  it("says the worktree has never synced when there is no task", async () => {
    setup({ lastTask: null });

    const lastSync = await screen.findByTestId("worktree-last-sync");
    expect(
      await within(lastSync).findByText("Never synced"),
    ).toBeInTheDocument();
  });

  it("flags new remote commits and pulls the worktree's branch", async () => {
    setup({ hasRemoteChanges: true });

    const remoteCard = await screen.findByTestId("worktree-remote-branch");
    expect(
      await within(remoteCard).findByText("New commits to pull"),
    ).toBeInTheDocument();

    const pullButton = screen.getByRole("button", { name: /Pull changes/ });
    await waitFor(() => expect(pullButton).toBeEnabled());
    await userEvent.click(pullButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    const request = fetchMock.callHistory.lastCall(
      "path:/api/ee/remote-sync/import",
    )?.request;
    expect(await request?.json()).toEqual({
      branch: WORKTREE.branch,
      expected_branch: WORKTREE.branch,
      worktree_id: WORKTREE.id,
    });
  });

  it("opens the push modal for a dirty worktree when the remote has not advanced", async () => {
    setup({
      dirty: [createMockRemoteSyncEntity({ model: "transform" })],
      exportPreflight: { has_changes: false },
    });

    const pushButton = await screen.findByRole("button", {
      name: /Push changes/,
    });
    await waitFor(() => expect(pushButton).toBeEnabled());
    await userEvent.click(pushButton);

    expect(await screen.findByText("Push to Git")).toBeInTheDocument();
  });

  it("hides the push action when remote sync is read-only", async () => {
    setup({ syncType: "read-only" });

    await screen.findByTestId("worktree-home-title");
    expect(
      screen.queryByRole("button", { name: /Push changes/ }),
    ).not.toBeInTheDocument();
  });
});
