import { combineReducers, configureStore } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { Api } from "metabase/api";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";

import {
  type SyncTaskState,
  initialState,
  remoteSyncReducer,
  taskStarted,
} from "../sync-task-slice";

import { remoteSyncListenerMiddleware } from "./remote-sync-listener-middleware";

interface TestState {
  plugins: { remoteSyncPlugin: SyncTaskState };
}

const createTestStore = () => {
  return configureStore({
    reducer: combineReducers({
      // nested as the app registers it (PLUGIN_REDUCERS -> state.plugins), which the selectors read
      plugins: combineReducers({ remoteSyncPlugin: remoteSyncReducer }),
      // EnterpriseApi is an enhanced version of Api, so they share the same reducer
      [Api.reducerPath]: Api.reducer,
    }),
    preloadedState: {
      plugins: { remoteSyncPlugin: initialState },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      })
        .concat(Api.middleware)
        // Cast to any to avoid complex type mismatch between the listener middleware
        // and the test store's State type (test store uses simplified State)
        .concat(remoteSyncListenerMiddleware.middleware as any),
  });
};

const waitForCondition = async (
  condition: () => boolean,
  timeout = 1000,
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("remote-sync-listener-middleware", () => {
  describe("updateRemoteSyncSettings listener", () => {
    it("should show modal when settings save succeeds with task_id", async () => {
      fetchMock.put("path:/api/ee/remote-sync/settings", {
        success: true,
        task_id: 123,
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.updateRemoteSyncSettings.initiate({
          "remote-sync-url": "https://github.com/test/repo.git",
          "remote-sync-token": "token123",
        }),
      );

      // Wait for the request to complete and middleware to process
      await waitForCondition(() => {
        const state = store.getState() as TestState;
        return state.plugins.remoteSyncPlugin?.showModal === true;
      });

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(true);
      expect(state.plugins.remoteSyncPlugin?.currentTask?.sync_task_type).toBe(
        "import",
      );
    });

    it("should NOT show modal when settings save succeeds without task_id", async () => {
      fetchMock.put("path:/api/ee/remote-sync/settings", {
        success: true,
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.updateRemoteSyncSettings.initiate({
          "remote-sync-url": "https://github.com/test/repo.git",
          "remote-sync-token": "token123",
        }),
      );

      // Wait for the request to complete
      await waitForCondition(() =>
        fetchMock.callHistory.done("path:/api/ee/remote-sync/settings"),
      );

      // Give middleware time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.plugins.remoteSyncPlugin?.currentTask).toBeNull();
    });

    it("should NOT show modal when settings save fails", async () => {
      fetchMock.put("path:/api/ee/remote-sync/settings", {
        status: 500,
        body: { message: "Internal server error" },
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.updateRemoteSyncSettings.initiate({
          "remote-sync-url": "https://github.com/test/repo.git",
          "remote-sync-token": "token123",
        }),
      );

      // Wait for the request to complete
      await waitForCondition(() =>
        fetchMock.callHistory.done("path:/api/ee/remote-sync/settings"),
      );

      // Give middleware time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.plugins.remoteSyncPlugin?.currentTask).toBeNull();
    });

    it("should NOT show modal when disabling remote sync", async () => {
      fetchMock.put("path:/api/ee/remote-sync/settings", {
        success: true,
        // No task_id when disabling - backend doesn't start a sync
      });

      const store = createTestStore();

      // Dispatch the mutation with empty URL (disabling remote sync)
      store.dispatch(
        remoteSyncApi.endpoints.updateRemoteSyncSettings.initiate({
          "remote-sync-url": "",
        }),
      );

      // Wait for the request to complete
      await waitForCondition(() =>
        fetchMock.callHistory.done("path:/api/ee/remote-sync/settings"),
      );

      // Give middleware time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.plugins.remoteSyncPlugin?.currentTask).toBeNull();
    });
  });

  describe("importChanges listener", () => {
    it("should show modal when import request starts", async () => {
      fetchMock.post("path:/api/ee/remote-sync/import", {
        status: "running",
        task_id: 456,
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.importChanges.initiate({
          branch: "main",
        }),
      );

      // The import listener triggers on matchPending, so modal should show immediately
      await waitForCondition(() => {
        const state = store.getState() as TestState;
        return state.plugins.remoteSyncPlugin?.showModal === true;
      });

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(true);
      expect(state.plugins.remoteSyncPlugin?.currentTask?.sync_task_type).toBe(
        "import",
      );
    });

    it("should clear task when import request fails", async () => {
      fetchMock.post("path:/api/ee/remote-sync/import", {
        status: 500,
        body: { message: "Import failed" },
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.importChanges.initiate({
          branch: "main",
        }),
      );

      // Wait for the request to fail
      await waitForCondition(() =>
        fetchMock.callHistory.done("path:/api/ee/remote-sync/import"),
      );

      // Give middleware time to process the rejection
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.plugins.remoteSyncPlugin?.currentTask).toBeNull();
    });
  });

  describe("getRemoteSyncCurrentTask listener", () => {
    const CURRENT_TASK_URL = "path:/api/ee/remote-sync/current-task";

    const finishedTask = (sync_task_type: "import" | "export") => ({
      id: 7,
      sync_task_type,
      status: "successful",
      progress: 1,
      started_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T00:00:05Z",
      last_progress_report_at: "2026-01-01T00:00:05Z",
      error_message: null,
      initiated_by: 1,
    });

    const runningTask = (sync_task_type: "import" | "export") => ({
      ...finishedTask(sync_task_type),
      id: 8,
      status: "running",
      progress: 0.5,
      ended_at: null,
    });

    const fetchCurrentTask = (store: ReturnType<typeof createTestStore>) =>
      store.dispatch(
        remoteSyncApi.endpoints.getRemoteSyncCurrentTask.initiate(undefined, {
          forceRefetch: true,
        }),
      );

    it("ignores a finished task when no task is being watched", async () => {
      fetchMock.get(CURRENT_TASK_URL, finishedTask("export"));
      const store = createTestStore();

      await fetchCurrentTask(store);

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin.currentTask).toBeNull();
      expect(state.plugins.remoteSyncPlugin.showModal).toBe(false);
    });

    it("handles the end of a task once and stops refetching it", async () => {
      fetchMock.get(CURRENT_TASK_URL, finishedTask("export"));
      const store = createTestStore();
      store.dispatch(taskStarted({ taskType: "export" }));

      await fetchCurrentTask(store);
      await new Promise((resolve) => setTimeout(resolve, 700));

      const state = store.getState() as TestState;
      expect(
        state.plugins.remoteSyncPlugin.currentTask?.ended_at,
      ).not.toBeNull();
      expect(state.plugins.remoteSyncPlugin.showModal).toBe(false);
      // The terminal handling invalidates this query once; the refetched, already-ended
      // task must not be treated as another event, or the query would refetch forever.
      expect(
        fetchMock.callHistory.calls(CURRENT_TASK_URL).length,
      ).toBeLessThanOrEqual(2);
    });

    it("keeps the modal of a task started right after the previous one finished", async () => {
      // The refetch triggered by the export's end still reports the export; later polls see the import.
      fetchMock.getOnce(CURRENT_TASK_URL, finishedTask("export"));
      fetchMock.get(CURRENT_TASK_URL, runningTask("import"));
      const store = createTestStore();
      store.dispatch(taskStarted({ taskType: "export" }));

      await fetchCurrentTask(store);
      store.dispatch(taskStarted({ taskType: "import" }));
      await new Promise((resolve) => setTimeout(resolve, 700));

      const state = store.getState() as TestState;
      expect(state.plugins.remoteSyncPlugin.currentTask?.sync_task_type).toBe(
        "import",
      );
      expect(state.plugins.remoteSyncPlugin.showModal).toBe(true);
    });
  });
});
