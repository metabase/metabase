import {
  setupPropertiesEndpoints,
  setupRemoteSyncDirtyEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { RemoteSyncEntity } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

const createMockDirtyEntity = (
  overrides: Partial<RemoteSyncEntity> = {},
): RemoteSyncEntity => ({
  id: 1,
  name: "Test Entity",
  model: "card",
  sync_status: "update",
  collection_id: 1,
  ...overrides,
});

/**
 * Compute changedCollections map from dirty entities.
 * This mirrors what the backend does - marking collections that contain dirty entities.
 */
const computeChangedCollections = (
  dirty: RemoteSyncEntity[],
): Record<number, boolean> => {
  const changedCollections: Record<number, boolean> = {};
  for (const entity of dirty) {
    if (entity.collection_id != null) {
      changedCollections[entity.collection_id] = true;
    }
  }
  return changedCollections;
};

const setup = ({
  isGitSyncVisible = true,
  dirty = [],
}: {
  isGitSyncVisible?: boolean;
  dirty?: RemoteSyncEntity[];
} = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": isGitSyncVisible,
    "remote-sync-branch": isGitSyncVisible ? "main" : null,
    "remote-sync-type": "read-write",
  });

  const changedCollections = computeChangedCollections(dirty);

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": isGitSyncVisible,
      "remote-sync-branch": isGitSyncVisible ? "main" : null,
      "remote-sync-type": "read-write",
    }),
  });

  return renderHookWithProviders(() => useRemoteSyncDirtyState(), {
    storeInitialState,
  });
};

describe("useRemoteSyncDirtyState", () => {
  describe("isDirty", () => {
    it("returns false when no dirty entities exist", async () => {
      const { result } = setup({ dirty: [] });

      await waitFor(() => {
        expect(result.current.isDirty).toBe(false);
      });
    });

    it("returns true when dirty entities exist", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity()],
      });

      await waitFor(() => {
        expect(result.current.isDirty).toBe(true);
      });
    });
  });

  describe("isCollectionDirty", () => {
    it("returns false for collection without dirty items", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.isCollectionDirty(2)).toBe(false);
    });

    it("returns true for collection with dirty items", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.isCollectionDirty(1)).toBe(true);
    });

    it("returns false for non-numeric collection id", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.isCollectionDirty("root")).toBe(false);
      expect(result.current.isCollectionDirty(undefined)).toBe(false);
    });
  });

  describe("hasAnyCollectionDirty", () => {
    it("returns false when no collections in set are dirty", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty(new Set([2, 3]))).toBe(false);
    });

    it("returns true when any collection in set is dirty", async () => {
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({ id: 1, collection_id: 1 }),
          createMockDirtyEntity({ id: 2, collection_id: 3 }),
        ],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty(new Set([2, 3]))).toBe(true);
    });

    it("works with array input", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty([1, 2])).toBe(true);
    });
  });

  describe("hasDirtyInCollectionTree", () => {
    it("returns false when no collections in tree are dirty", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 100 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        false,
      );
    });

    it("returns true when a collection in tree has dirty children", async () => {
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 2 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        true,
      );
    });

    it("returns true when a collection in tree is itself dirty", async () => {
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({
            id: 2,
            model: "collection",
            collection_id: undefined,
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        true,
      );
    });

    it("returns false when dirty collection is not in tree", async () => {
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({
            id: 100,
            model: "collection",
            collection_id: undefined,
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        false,
      );
    });
  });

  describe("hasRemovedItems", () => {
    it("returns false when no entities have removed status", async () => {
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({ sync_status: "update" }),
          createMockDirtyEntity({ id: 2, sync_status: "create" }),
        ],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasRemovedItems).toBe(false);
    });

    it("returns true when any entity has removed status", async () => {
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({ sync_status: "update" }),
          createMockDirtyEntity({ id: 2, sync_status: "removed" }),
        ],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasRemovedItems).toBe(true);
    });

    it("returns false when dirty list is empty", async () => {
      const { result } = setup({ dirty: [] });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasRemovedItems).toBe(false);
    });
  });

  describe("when git sync is not visible", () => {
    it("returns empty dirty state", async () => {
      const { result } = setup({
        isGitSyncVisible: false,
        dirty: [createMockDirtyEntity()],
      });

      await waitFor(() => {
        expect(result.current.dirty).toEqual([]);
      });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.hasRemovedItems).toBe(false);
    });
  });
});
