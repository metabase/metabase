import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncDirtyEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { TRANSFORMS_ROOT_ID } from "metabase-enterprise/remote_sync/utils";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncEntity,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransformsCollection,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useHasTransformDirtyChanges } from "./use-has-transform-dirty-changes";

interface SetupOptions {
  isGitSyncVisible?: boolean;
  isTransformsSyncEnabled?: boolean;
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
  isTransformsSyncEnabled = true,
  collections = [],
  dirty = [],
}: SetupOptions = {}) => {
  setupEnterprisePlugins();

  const tokenFeatures = createMockTokenFeatures({ library: true });
  const settings = createMockSettings({
    "remote-sync-enabled": isGitSyncVisible,
    "remote-sync-branch": isGitSyncVisible ? "main" : null,
    "remote-sync-type": "read-write",
    "remote-sync-transforms": isTransformsSyncEnabled,
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
      "remote-sync-transforms": isTransformsSyncEnabled,
      "token-features": tokenFeatures,
    }),
  });

  return renderHookWithProviders(() => useHasTransformDirtyChanges(), {
    storeInitialState,
  });
};

describe("useHasTransformDirtyChanges", () => {
  it("returns false when no dirty changes exist", async () => {
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when git sync is not visible", async () => {
    const { result } = setup({
      isGitSyncVisible: false,
      collections: [createMockTransformsCollection()],
      dirty: [createMockRemoteSyncEntity({ model: "transform" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when remote-sync-transforms setting is disabled", async () => {
    const { result } = setup({
      isTransformsSyncEnabled: false,
      collections: [createMockTransformsCollection()],
      dirty: [createMockRemoteSyncEntity({ model: "transform" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when a transform entity is dirty", async () => {
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [createMockRemoteSyncEntity({ model: "transform" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when a transform tag entity is dirty", async () => {
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [createMockRemoteSyncEntity({ model: "transformtag" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when a pythonlibrary entity is dirty", async () => {
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [
        createMockRemoteSyncEntity({
          model: "pythonlibrary",
          name: "common.py",
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when a transforms-namespace collection is dirty", async () => {
    const transformsCollection = createMockTransformsCollection({ id: 100 });
    const { result } = setup({
      collections: [transformsCollection],
      dirty: [createMockRemoteSyncEntity({ id: 100, model: "collection" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false when dirty changes exist but not transform-related", async () => {
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [createMockRemoteSyncEntity({ model: "card" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when collection is dirty but not in transforms namespace", async () => {
    const regularCollection = createMockCollection({ id: 50 });
    const { result } = setup({
      collections: [createMockTransformsCollection(), regularCollection],
      dirty: [createMockRemoteSyncEntity({ id: 50, model: "collection" })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when Transforms root collection (id=-1) is dirty with create status", async () => {
    const transformsRootEntity = createMockRemoteSyncEntity({
      id: TRANSFORMS_ROOT_ID,
      name: "Transforms",
      model: "collection",
      sync_status: "create",
    });
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [transformsRootEntity],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when Transforms root collection (id=-1) is dirty with delete status", async () => {
    const transformsRootEntity = createMockRemoteSyncEntity({
      id: TRANSFORMS_ROOT_ID,
      name: "Transforms",
      model: "collection",
      sync_status: "delete",
    });
    const { result } = setup({
      collections: [createMockTransformsCollection()],
      dirty: [transformsRootEntity],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns true when Transforms root collection (id=-1) is dirty even when transforms setting is disabled", async () => {
    const transformsRootEntity = createMockRemoteSyncEntity({
      id: TRANSFORMS_ROOT_ID,
      name: "Transforms",
      model: "collection",
      sync_status: "delete",
    });
    const { result } = setup({
      isTransformsSyncEnabled: false,
      collections: [],
      dirty: [transformsRootEntity],
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});
