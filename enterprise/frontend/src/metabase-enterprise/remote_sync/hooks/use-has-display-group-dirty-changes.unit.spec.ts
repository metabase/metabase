import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncDirtyEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockSnippetsCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  useHasDataActionsDirtyChanges,
  useHasSnippetsDirtyChanges,
} from "./use-has-display-group-dirty-changes";

const createLibraryCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
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
  hook: () => boolean;
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
  hook,
  isGitSyncVisible = true,
  collections = [],
  dirty = [],
}: SetupOptions) => {
  setupEnterprisePlugins();

  const tokenFeatures = createMockTokenFeatures({ library: true });
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

  return renderHookWithProviders(hook, {
    storeInitialState,
  });
};

const createDataActionsCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 200,
    name: "Data actions folder",
    namespace: "data-actions",
    ...overrides,
  });

describe("useHasSnippetsDirtyChanges", () => {
  it("returns true for a dirty snippet", async () => {
    const { result } = setup({
      hook: useHasSnippetsDirtyChanges,
      collections: [createMockSnippetsCollection({ id: 100 })],
      dirty: [
        createMockDirtyEntity({
          id: 10,
          model: "nativequerysnippet",
          collection_id: undefined,
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true for a dirty nested collection in the snippets namespace", async () => {
    const parent = createMockSnippetsCollection({ id: 100 });
    const child = createMockSnippetsCollection({ id: 101 });
    parent.children = [child];

    const { result } = setup({
      hook: useHasSnippetsDirtyChanges,
      collections: [parent, child],
      dirty: [createMockDirtyEntity({ id: 101, model: "collection" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false for dirty Library items", async () => {
    const { result } = setup({
      hook: useHasSnippetsDirtyChanges,
      collections: [createLibraryCollection({ id: 1 })],
      dirty: [createMockDirtyEntity({ collection_id: 1 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when git sync is not visible", async () => {
    const { result } = setup({
      hook: useHasSnippetsDirtyChanges,
      isGitSyncVisible: false,
      dirty: [createMockDirtyEntity({ model: "nativequerysnippet" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});

describe("useHasDataActionsDirtyChanges", () => {
  it("returns true for a dirty action without a model", async () => {
    const { result } = setup({
      hook: useHasDataActionsDirtyChanges,
      dirty: [
        createMockDirtyEntity({
          model: "action",
          collection_id: undefined,
          card_id: null,
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true for a dirty collection in the data actions namespace", async () => {
    const { result } = setup({
      hook: useHasDataActionsDirtyChanges,
      collections: [createDataActionsCollection({ id: 200 })],
      dirty: [createMockDirtyEntity({ id: 200, model: "collection" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false for a dirty model action", async () => {
    const { result } = setup({
      hook: useHasDataActionsDirtyChanges,
      dirty: [createMockDirtyEntity({ model: "action", card_id: 5 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false for a dirty snippet", async () => {
    const { result } = setup({
      hook: useHasDataActionsDirtyChanges,
      dirty: [createMockDirtyEntity({ model: "nativequerysnippet" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
