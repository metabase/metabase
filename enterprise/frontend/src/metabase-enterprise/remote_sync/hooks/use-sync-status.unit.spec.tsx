import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { WorktreeId } from "metabase-types/api";
import {
  createMockRemoteSyncTask,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { taskStarted, taskUpdated } from "../sync-task-slice";

import { useSyncStatus } from "./use-sync-status";

const currentTaskCalls = () =>
  fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter((url) => url.includes("/api/ee/remote-sync/current-task"));

const setup = ({ worktreeId }: { worktreeId?: WorktreeId | null } = {}) => {
  const tokenFeatures = createMockTokenFeatures({ remote_sync: true });
  const settingOverrides = {
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write" as const,
    "token-features": tokenFeatures,
  };

  // The remote-sync redux reducer is only registered when the premium gate passes, so the settings
  // have to be in place before the plugins initialize.
  mockSettings(settingOverrides);
  setupEnterprisePlugins();

  setupPropertiesEndpoints(createMockSettings(settingOverrides));
  fetchMock.get("path:/api/ee/remote-sync/current-task", () => ({
    body: createMockRemoteSyncTask({ status: "running", ended_at: null }),
  }));

  return renderHookWithProviders(() => useSyncStatus({ worktreeId }), {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings(settingOverrides),
    }),
  });
};

describe("useSyncStatus", () => {
  it("polls a worktree's task even from the app-wide instance, so it still sees the task finish", async () => {
    // The app-wide instance (StatusListing) is the only one guaranteed to be mounted; a worktree's
    // own UI can be unmounted while its import runs.
    const { store } = setup();

    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    await waitFor(() => {
      expect(
        currentTaskCalls().some((url) => url.includes("worktree-id=5")),
      ).toBe(true);
    });
  });

  it("renders a worktree task's progress modal from the app-wide instance, without reporting it as its own", async () => {
    // The worktree's own UI can be left while its task runs, so the app-wide instance owns the
    // modal for whichever scope the task belongs to.
    const { result, store } = setup();

    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    await waitFor(() => {
      expect(
        currentTaskCalls().some((url) => url.includes("worktree-id=5")),
      ).toBe(true);
    });

    expect(result.current.progressModal).not.toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isAnyTaskRunning).toBe(true);
  });

  it("renders no progress modal from a worktree's instance, even for its own task", async () => {
    const { result, store } = setup({ worktreeId: 5 });

    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(true);
    });

    expect(result.current.progressModal).toBeNull();
    expect(result.current.isAnyTaskRunning).toBe(true);
  });

  it("reports another scope's running task as blocking without reporting it as its own", async () => {
    const { result, store } = setup({ worktreeId: 7 });

    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    await waitFor(() => {
      expect(result.current.isAnyTaskRunning).toBe(true);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.isIdle).toBe(true);
    // Only the app-wide instance polls a task of another scope.
    expect(currentTaskCalls()).toHaveLength(0);
  });

  it("polls the main app's task without a worktree-id", async () => {
    const { result, store } = setup();

    act(() => {
      store.dispatch(taskStarted({ taskType: "import" }));
    });

    await waitFor(() => {
      expect(currentTaskCalls().length).toBeGreaterThan(0);
    });

    expect(
      currentTaskCalls().every((url) => !url.includes("worktree-id")),
    ).toBe(true);
    expect(result.current.isRunning).toBe(true);
    expect(result.current.progressModal).not.toBeNull();
  });

  it("stops polling once the tracked task reaches a terminal state", async () => {
    const { store } = setup({ worktreeId: 5 });

    act(() => {
      store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
    });

    await waitFor(() => {
      expect(currentTaskCalls().length).toBeGreaterThan(0);
    });

    act(() => {
      store.dispatch(
        taskUpdated(
          createMockRemoteSyncTask({
            sync_task_type: "import",
            worktree_id: 5,
            status: "successful",
            ended_at: "2000-01-01T00:00:01Z",
          }),
        ),
      );
    });

    const callsAfterCompletion = currentTaskCalls().length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentTaskCalls().length).toBe(callsAfterCompletion);
  });
});
