import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncDirtyEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockSnippetsCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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

interface SetupOptions {
  isGitSyncVisible?: boolean;
  collections?: Collection[];
  dirty?: RemoteSyncEntity[];
}

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
  collections = [],
  dirty = [],
}: SetupOptions = {}) => {
  setupEnterprisePlugins();

  const tokenFeatures = createMockTokenFeatures({ data_studio: true });
  const settings = createMockSettings({
    "remote-sync-enabled": isGitSyncVisible,
    "remote-sync-branch": isGitSyncVisible ? "main" : null,
    "remote-sync-type": "read-write",
    "token-features": tokenFeatures,
  });

  const changedCollections = computeChangedCollections(dirty);

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections });
  setupCollectionsEndpoints({ collections });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": isGitSyncVisible,
      "remote-sync-branch": isGitSyncVisible ? "main" : null,
      "remote-sync-type": "read-write",
      "token-features": tokenFeatures,
    }),
  });

  return renderHookWithProviders(() => useHasLibraryDirtyChanges(), {
    storeInitialState,
  });
};

describe("useHasLibraryDirtyChanges", () => {
  it("returns false when no dirty changes exist", async () => {
    const { result } = setup({
      collections: [createLibraryCollection()],
      dirty: [],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when dirty changes exist but not in Library collections", async () => {
    const { result } = setup({
      collections: [
        createLibraryCollection({ id: 1 }),
        createRegularCollection({ id: 2 }),
      ],
      dirty: [createMockDirtyEntity({ collection_id: 2 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when Library collection has dirty items", async () => {
    const { result } = setup({
      collections: [createLibraryCollection({ id: 1 })],
      dirty: [createMockDirtyEntity({ collection_id: 1 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false when no Library collection exists", async () => {
    const { result } = setup({
      collections: [createRegularCollection()],
      dirty: [createMockDirtyEntity({ collection_id: 2 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when there are removed items even if no other dirty changes", async () => {
    const { result } = setup({
      collections: [createLibraryCollection()],
      dirty: [createMockDirtyEntity({ sync_status: "removed" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when there are removed items even without Library collection", async () => {
    const { result } = setup({
      collections: [createRegularCollection()],
      dirty: [createMockDirtyEntity({ sync_status: "removed" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false when git sync is not visible", async () => {
    const { result } = setup({
      isGitSyncVisible: false,
      collections: [createLibraryCollection()],
      dirty: [createMockDirtyEntity({ collection_id: 1 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  describe("snippet dirty state", () => {
    it("returns true when a dirty snippet exists", async () => {
      const { result } = setup({
        collections: [
          createLibraryCollection({ id: 1 }),
          createMockSnippetsCollection({ id: 100 }),
        ],
        dirty: [
          createMockDirtyEntity({
            id: 10,
            model: "nativequerysnippet",
            name: "My Snippet",
            collection_id: 100,
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it("returns true when a dirty snippet exists in root (no collection)", async () => {
      const { result } = setup({
        collections: [createLibraryCollection({ id: 1 })],
        dirty: [
          createMockDirtyEntity({
            id: 10,
            model: "nativequerysnippet",
            name: "Root Snippet",
            collection_id: undefined,
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it("returns true when a dirty collection in snippets namespace exists", async () => {
      const { result } = setup({
        collections: [
          createLibraryCollection({ id: 1 }),
          createMockSnippetsCollection({ id: 100 }),
        ],
        dirty: [
          createMockDirtyEntity({
            id: 100,
            model: "collection",
            name: "Snippets Folder",
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it("returns false when dirty collection is not in snippets namespace", async () => {
      const { result } = setup({
        collections: [
          createLibraryCollection({ id: 1 }),
          createRegularCollection({ id: 2 }),
          createMockSnippetsCollection({ id: 100 }),
        ],
        dirty: [
          createMockDirtyEntity({
            id: 2,
            model: "collection",
            name: "Regular Collection",
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it("returns false when dirty snippets exist but git sync is not visible", async () => {
      const { result } = setup({
        isGitSyncVisible: false,
        collections: [
          createLibraryCollection({ id: 1 }),
          createMockSnippetsCollection({ id: 100 }),
        ],
        dirty: [
          createMockDirtyEntity({
            id: 10,
            model: "nativequerysnippet",
            name: "My Snippet",
            collection_id: 100,
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it("returns true when nested snippets collection is dirty", async () => {
      const parentSnippetsCollection = createMockSnippetsCollection({
        id: 100,
        name: "Parent Snippets Folder",
      });
      const childSnippetsCollection = createMockSnippetsCollection({
        id: 101,
        name: "Child Snippets Folder",
      });
      // Set up parent-child relationship
      parentSnippetsCollection.children = [childSnippetsCollection];

      const { result } = setup({
        collections: [
          createLibraryCollection({ id: 1 }),
          parentSnippetsCollection,
          childSnippetsCollection,
        ],
        dirty: [
          createMockDirtyEntity({
            id: 101,
            model: "collection",
            name: "Child Snippets Folder",
          }),
        ],
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });
});
