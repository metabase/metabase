import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCreateCollectionEndpoint,
  setupDeleteCollectionEndpoint,
  setupGetCollectionEndpoint,
  setupRemoteSyncDirtyEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { Api } from "metabase/api";
import { collectionApi } from "metabase/api/collection";
import { settings as settingsReducer } from "metabase/redux/settings";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  type SyncTaskState,
  initialState,
  remoteSyncReducer,
} from "../sync-task-slice";

import { remoteSyncListenerMiddleware } from "./remote-sync-listener-middleware";

interface TestState {
  remoteSyncPlugin: SyncTaskState;
  settings: {
    values: Record<string, unknown>;
    loading: boolean;
  };
}

const createTestStore = (settingsOverrides: Record<string, unknown> = {}) => {
  return configureStore({
    reducer: combineReducers({
      remoteSyncPlugin: remoteSyncReducer,
      settings: settingsReducer,
      // EnterpriseApi is an enhanced version of Api, so they share the same reducer
      [Api.reducerPath]: Api.reducer,
    }),
    preloadedState: {
      remoteSyncPlugin: initialState,
      settings: {
        values: {
          "remote-sync-transforms": false,
          ...settingsOverrides,
        },
        loading: false,
      },
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
        return state.remoteSyncPlugin?.showModal === true;
      });

      const state = store.getState() as TestState;
      expect(state.remoteSyncPlugin?.showModal).toBe(true);
      expect(state.remoteSyncPlugin?.currentTask?.sync_task_type).toBe(
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
      expect(state.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.remoteSyncPlugin?.currentTask).toBeNull();
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
      expect(state.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.remoteSyncPlugin?.currentTask).toBeNull();
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
      expect(state.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.remoteSyncPlugin?.currentTask).toBeNull();
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
        return state.remoteSyncPlugin?.showModal === true;
      });

      const state = store.getState() as TestState;
      expect(state.remoteSyncPlugin?.showModal).toBe(true);
      expect(state.remoteSyncPlugin?.currentTask?.sync_task_type).toBe(
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
      expect(state.remoteSyncPlugin?.showModal).toBe(false);
      expect(state.remoteSyncPlugin?.currentTask).toBeNull();
    });

    it("should set conflict variant to 'setup' when import fails with conflict", async () => {
      fetchMock.get("path:/api/ee/remote-sync/current-task", {
        status: 200,
        body: {
          status: "conflict",
        },
      });

      const store = createTestStore();

      // Dispatch the mutation
      store.dispatch(
        remoteSyncApi.endpoints.getRemoteSyncCurrentTask.initiate(),
      );

      // Wait for the request to fail
      await waitForCondition(() =>
        fetchMock.callHistory.done("path:/api/ee/remote-sync/current-task"),
      );

      expect(store.getState().remoteSyncPlugin?.showModal).toBe(false);

      await waitFor(() => {
        expect(store.getState().remoteSyncPlugin?.syncConflictVariant).toBe(
          "setup",
        );
      });
    });
  });

  describe("collection listeners for transforms namespace", () => {
    afterEach(() => {
      fetchMock.clearHistory();
    });

    describe("createCollection listener", () => {
      it("should invalidate tags when creating a transforms namespace collection with transforms sync enabled", async () => {
        const transformsCollection = createMockCollection({
          id: 100,
          name: "My Transforms Collection",
          namespace: "transforms",
          is_remote_synced: false,
        });

        setupCreateCollectionEndpoint(transformsCollection);
        setupRemoteSyncDirtyEndpoint();

        const store = createTestStore({
          "remote-sync-transforms": true,
        });

        // Subscribe to the dirty query first so RTK Query will refetch when tags are invalidated
        store.dispatch(
          remoteSyncApi.endpoints.getRemoteSyncChanges.initiate(undefined),
        );

        // Wait for initial dirty query to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("remote-sync-dirty"),
        );

        // Dispatch the create collection mutation
        store.dispatch(
          collectionApi.endpoints.createCollection.initiate({
            name: "My Transforms Collection",
            namespace: "transforms",
          }),
        );

        // Wait for the request to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("create-collection"),
        );

        // Give middleware time to process and trigger invalidation
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the dirty endpoint was called more than once (initial + refetch after invalidation)
        const dirtyCalls = fetchMock.callHistory.calls("remote-sync-dirty");
        expect(dirtyCalls.length).toBeGreaterThan(1);
      });

      it("should NOT invalidate tags when creating a transforms collection with transforms sync disabled", async () => {
        const transformsCollection = createMockCollection({
          id: 100,
          name: "My Transforms Collection",
          namespace: "transforms",
          is_remote_synced: false,
        });

        setupCreateCollectionEndpoint(transformsCollection);
        setupRemoteSyncDirtyEndpoint();

        const store = createTestStore({
          "remote-sync-transforms": false,
        });

        // Subscribe to the dirty query first
        store.dispatch(
          remoteSyncApi.endpoints.getRemoteSyncChanges.initiate(undefined),
        );

        // Wait for initial dirty query to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("remote-sync-dirty"),
        );

        // Give a moment for RTK Query to settle
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Count calls before mutation
        const callsBefore =
          fetchMock.callHistory.calls("remote-sync-dirty").length;

        // Dispatch the create collection mutation
        store.dispatch(
          collectionApi.endpoints.createCollection.initiate({
            name: "My Transforms Collection",
            namespace: "transforms",
          }),
        );

        // Wait for the request to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("create-collection"),
        );

        // Give middleware time to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the dirty endpoint was NOT called again (no invalidation)
        const callsAfter =
          fetchMock.callHistory.calls("remote-sync-dirty").length;
        expect(callsAfter).toBe(callsBefore);
      });

      it("should invalidate tags when creating a remote-synced collection", async () => {
        const remoteSyncedCollection = createMockCollection({
          id: 100,
          name: "Synced Collection",
          is_remote_synced: true,
        });

        setupCreateCollectionEndpoint(remoteSyncedCollection);
        setupRemoteSyncDirtyEndpoint();

        const store = createTestStore();

        // Subscribe to the dirty query first
        store.dispatch(
          remoteSyncApi.endpoints.getRemoteSyncChanges.initiate(undefined),
        );

        // Wait for initial dirty query to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("remote-sync-dirty"),
        );

        // Dispatch the create collection mutation
        store.dispatch(
          collectionApi.endpoints.createCollection.initiate({
            name: "Synced Collection",
          }),
        );

        // Wait for the request to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("create-collection"),
        );

        // Give middleware time to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the dirty endpoint was called more than once
        const dirtyCalls = fetchMock.callHistory.calls("remote-sync-dirty");
        expect(dirtyCalls.length).toBeGreaterThan(1);
      });
    });

    describe("updateCollection listener", () => {
      it("should invalidate tags when updating a transforms namespace collection with transforms sync enabled", async () => {
        const transformsCollection = createMockCollection({
          id: 100,
          name: "Updated Transforms Collection",
          namespace: "transforms",
          is_remote_synced: false,
        });

        setupUpdateCollectionEndpoint(transformsCollection);
        setupRemoteSyncDirtyEndpoint();

        const store = createTestStore({
          "remote-sync-transforms": true,
        });

        // Subscribe to the dirty query first
        store.dispatch(
          remoteSyncApi.endpoints.getRemoteSyncChanges.initiate(undefined),
        );

        // Wait for initial dirty query to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("remote-sync-dirty"),
        );

        // Dispatch the update collection mutation
        store.dispatch(
          collectionApi.endpoints.updateCollection.initiate({
            id: 100,
            name: "Updated Transforms Collection",
          }),
        );

        // Wait for the request to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("update-collection-100"),
        );

        // Give middleware time to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the dirty endpoint was called more than once
        const dirtyCalls = fetchMock.callHistory.calls("remote-sync-dirty");
        expect(dirtyCalls.length).toBeGreaterThan(1);
      });
    });

    describe("deleteCollection listener", () => {
      it("should invalidate tags when deleting a remote-synced collection", async () => {
        // Pre-populate the store with the collection data via RTK Query cache
        const remoteSyncedCollection = createMockCollection({
          id: 100,
          name: "Synced Collection To Delete",
          is_remote_synced: true,
        });

        setupGetCollectionEndpoint(remoteSyncedCollection);
        setupDeleteCollectionEndpoint(100);
        setupRemoteSyncDirtyEndpoint();

        const store = createTestStore();

        // Subscribe to the dirty query first
        store.dispatch(
          remoteSyncApi.endpoints.getRemoteSyncChanges.initiate(undefined),
        );

        // Wait for initial dirty query to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("remote-sync-dirty"),
        );

        // First, fetch the collection to populate the cache
        await store.dispatch(
          collectionApi.endpoints.getCollection.initiate({ id: 100 }),
        );

        // Wait for fetch to complete
        await waitForCondition(() =>
          fetchMock.callHistory.done("get-collection-100"),
        );

        // Now delete the collection
        store.dispatch(
          collectionApi.endpoints.deleteCollection.initiate({ id: 100 }),
        );

        // Wait for delete to complete
        await waitForCondition(() =>
          fetchMock.callHistory.called("delete-collection-100"),
        );

        // Give middleware time to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the dirty endpoint was called more than once
        const dirtyCalls = fetchMock.callHistory.calls("remote-sync-dirty");
        expect(dirtyCalls.length).toBeGreaterThan(1);
      });
    });
  });
});
