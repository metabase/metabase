import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";

// Mock the useGitSyncVisible hook before importing useRemoteSyncDirtyState
const mockUseGitSyncVisible = jest.fn(() => ({
  isVisible: true,
  currentBranch: "main",
}));
jest.mock("./use-git-sync-visible", () => ({
  useGitSyncVisible: () => mockUseGitSyncVisible(),
}));

import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

const createMockDirtyEntity = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Test Entity",
  description: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: null,
  model: "card" as const,
  sync_status: "update" as const,
  collection_id: 1,
  ...overrides,
});

const setupEndpoints = ({
  dirty = [],
  changedCollections = {},
}: {
  dirty?: Array<ReturnType<typeof createMockDirtyEntity>>;
  changedCollections?: Record<number, boolean>;
} = {}) => {
  fetchMock.get("path:/api/ee/remote-sync/dirty", {
    dirty,
    changedCollections,
  });
};

const setup = ({
  isGitSyncVisible = true,
  dirty = [],
  changedCollections = {},
}: {
  isGitSyncVisible?: boolean;
  dirty?: Array<ReturnType<typeof createMockDirtyEntity>>;
  changedCollections?: Record<number, boolean>;
} = {}) => {
  mockUseGitSyncVisible.mockReturnValue({
    isVisible: isGitSyncVisible,
    currentBranch: "main",
  });
  setupEndpoints({ dirty, changedCollections });

  return renderHookWithProviders(() => useRemoteSyncDirtyState(), {});
};

describe("useRemoteSyncDirtyState", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

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
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.isCollectionDirty(2)).toBe(false);
    });

    it("returns true for collection with dirty items", async () => {
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.isCollectionDirty(1)).toBe(true);
    });

    it("returns false for non-numeric collection id", async () => {
      // changedCollections is built from dirty entities' collection_id
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
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      // Wait for data to be populated
      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty(new Set([2, 3]))).toBe(false);
    });

    it("returns true when any collection in set is dirty", async () => {
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [
          createMockDirtyEntity({ id: 1, collection_id: 1 }),
          createMockDirtyEntity({ id: 2, collection_id: 3 }),
        ],
      });

      // Wait for data to be populated
      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty(new Set([2, 3]))).toBe(true);
    });

    it("works with array input", async () => {
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 1 })],
      });

      // Wait for data to be populated
      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAnyCollectionDirty([1, 2])).toBe(true);
    });
  });

  describe("hasDirtyInCollectionTree", () => {
    it("returns false when no collections in tree are dirty", async () => {
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 100 })],
      });

      // Wait for data to be populated
      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        false,
      );
    });

    it("returns true when a collection in tree has dirty children", async () => {
      // changedCollections is built from dirty entities' collection_id
      const { result } = setup({
        dirty: [createMockDirtyEntity({ collection_id: 2 })],
      });

      // Wait for data to be populated
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
            collection_id: null,
          }),
        ],
      });

      // Wait for dirty to be populated
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
            collection_id: null,
          }),
        ],
      });

      // Wait for dirty to be populated
      await waitFor(() => {
        expect(result.current.dirty.length).toBeGreaterThan(0);
      });

      expect(result.current.hasDirtyInCollectionTree(new Set([1, 2, 3]))).toBe(
        false,
      );
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
    });
  });
});
