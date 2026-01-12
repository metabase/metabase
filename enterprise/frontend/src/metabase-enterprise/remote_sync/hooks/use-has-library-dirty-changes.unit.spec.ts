import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

// Mock isLibraryCollection to return true for collections with type "library"
jest.mock("metabase/collections/utils", () => ({
  ...jest.requireActual("metabase/collections/utils"),
  isLibraryCollection: (collection: { type: string | null }) =>
    collection?.type === "library",
}));

// Mock useRemoteSyncDirtyState
const mockHasDirtyInCollectionTree = jest.fn(
  (_collectionIds: Set<number>) => false,
);
const mockIsDirty = jest.fn(() => false);
jest.mock("./use-remote-sync-dirty-state", () => ({
  useRemoteSyncDirtyState: () => ({
    hasDirtyInCollectionTree: mockHasDirtyInCollectionTree,
    isDirty: mockIsDirty(),
  }),
}));

// Mock useGitSyncVisible
const mockUseGitSyncVisible = jest.fn<
  { isVisible: boolean; currentBranch: string | null },
  []
>(() => ({
  isVisible: true,
  currentBranch: "main",
}));
jest.mock("./use-git-sync-visible", () => ({
  useGitSyncVisible: () => mockUseGitSyncVisible(),
}));

import { useHasLibraryDirtyChanges } from "./use-has-library-dirty-changes";

const createLibraryCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
    ...overrides,
  });

const createRegularCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 2,
    name: "Regular Collection",
    type: null,
    ...overrides,
  });

const setupCollectionsEndpoint = (collections: Collection[]) => {
  fetchMock.get("path:/api/collection/tree", collections);
};

const setup = () => {
  return renderHookWithProviders(() => useHasLibraryDirtyChanges(), {});
};

describe("useHasLibraryDirtyChanges", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    mockUseGitSyncVisible.mockReturnValue({
      isVisible: true,
      currentBranch: "main",
    });
    mockIsDirty.mockReturnValue(false);
    mockHasDirtyInCollectionTree.mockReturnValue(false);
  });

  it("returns false when no dirty changes exist", async () => {
    setupCollectionsEndpoint([createLibraryCollection()]);
    mockIsDirty.mockReturnValue(false);

    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when dirty changes exist but not in Library collections", async () => {
    setupCollectionsEndpoint([
      createLibraryCollection({ id: 1 }),
      createRegularCollection({ id: 2 }),
    ]);
    mockIsDirty.mockReturnValue(true);
    mockHasDirtyInCollectionTree.mockReturnValue(false);

    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when Library collection has dirty items", async () => {
    setupCollectionsEndpoint([createLibraryCollection({ id: 1 })]);
    mockIsDirty.mockReturnValue(true);
    // When hasDirtyInCollectionTree is called with the library IDs, return true
    mockHasDirtyInCollectionTree.mockReturnValue(true);

    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("calls hasDirtyInCollectionTree when Library exists and isDirty", async () => {
    setupCollectionsEndpoint([createLibraryCollection({ id: 42 })]);
    mockIsDirty.mockReturnValue(true);
    mockHasDirtyInCollectionTree.mockReturnValue(false);

    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    // Verify hasDirtyInCollectionTree was called with a Set
    expect(mockHasDirtyInCollectionTree).toHaveBeenCalled();
    const calledWith = mockHasDirtyInCollectionTree.mock.calls[0]?.[0];
    expect(calledWith).toBeInstanceOf(Set);
    // The Set should contain numeric IDs (exact IDs depend on buildCollectionTree transformation)
    expect(calledWith?.size).toBeGreaterThan(0);
  });

  it("returns false when no Library collection exists", async () => {
    setupCollectionsEndpoint([createRegularCollection()]);
    mockIsDirty.mockReturnValue(true);
    mockHasDirtyInCollectionTree.mockReturnValue(true);

    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when git sync is not visible", async () => {
    setupCollectionsEndpoint([createLibraryCollection()]);
    mockUseGitSyncVisible.mockReturnValue({
      isVisible: false,
      currentBranch: null,
    });
    mockIsDirty.mockReturnValue(true);
    mockHasDirtyInCollectionTree.mockReturnValue(true);

    const { result } = setup();

    // When git sync is not visible, collections query is skipped,
    // so no library collection will be found
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
