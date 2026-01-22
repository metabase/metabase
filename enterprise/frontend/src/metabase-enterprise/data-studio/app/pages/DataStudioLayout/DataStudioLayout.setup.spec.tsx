import {
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { initializePlugin as initializeDependenciesPlugin } from "metabase-enterprise/dependencies";
import { initializePlugin as initializeFeatureLevelPermissionsPlugin } from "metabase-enterprise/feature_level_permissions";
import { initializePlugin as initializeRemoteSyncPlugin } from "metabase-enterprise/remote_sync";
import { initializePlugin as initializeTransformsPlugin } from "metabase-enterprise/transforms";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";
import {
  createMockDirtyCardEntity,
  createMockDirtyTransformEntity,
  createMockLibraryCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransformsCollection,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DataStudioLayout } from "./DataStudioLayout";

// ============================================================================
// Settings Helpers
// ============================================================================

const DEFAULT_TOKEN_FEATURES = createMockTokenFeatures({
  remote_sync: true,
  advanced_permissions: true,
  transforms: true,
});

interface RemoteSyncSettings {
  enabled: boolean;
  branch: string | null;
  type: "read-only" | "read-write";
  transforms: boolean;
}

const createRemoteSyncSettings = ({
  enabled = false,
  branch = null,
  type = "read-write",
  transforms = false,
}: Partial<RemoteSyncSettings> = {}) => ({
  "remote-sync-enabled": enabled,
  "remote-sync-branch": branch,
  "remote-sync-type": type,
  "remote-sync-transforms": transforms,
});

// ============================================================================
// Endpoint Setup Functions
// ============================================================================

const setupRemoteSyncSettingsEndpoints = (
  settings: Partial<RemoteSyncSettings> = {},
) => {
  const remoteSyncSettings = createRemoteSyncSettings(settings);
  setupPropertiesEndpoints(createMockSettings(remoteSyncSettings));
};

const setupDirtyEndpoints = ({
  dirty = [],
  collections = [],
}: {
  dirty?: RemoteSyncEntity[];
  collections?: Collection[];
} = {}) => {
  const changedCollections: Record<number, boolean> = {};
  for (const entity of dirty) {
    if (entity.collection_id != null) {
      changedCollections[entity.collection_id] = true;
    }
  }

  setupRemoteSyncEndpoints({
    dirty,
    changedCollections,
    branches: ["main"],
  });

  setupCollectionsEndpoints({ collections });
};

const setupNavbarEndpoints = (isOpened = true) => {
  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "isNavbarOpened",
    value: isOpened,
  });
};

// ============================================================================
// Store State Helpers
// ============================================================================

interface StoreStateOptions {
  isAdmin?: boolean;
  remoteSyncSettings?: Partial<RemoteSyncSettings>;
}

const createStoreState = ({
  isAdmin = true,
  remoteSyncSettings = {},
}: StoreStateOptions = {}) => {
  const settings = createRemoteSyncSettings(remoteSyncSettings);

  return createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: isAdmin,
        can_access_db_details: false,
      },
    }),
    settings: mockSettings({
      ...settings,
      "token-features": DEFAULT_TOKEN_FEATURES,
    }),
  });
};

// ============================================================================
// Plugin Initialization
// ============================================================================

const initializePlugins = () => {
  initializeRemoteSyncPlugin();
  initializeFeatureLevelPermissionsPlugin();
  initializeTransformsPlugin();
  initializeDependenciesPlugin();
};

// ============================================================================
// Render Helper
// ============================================================================

const renderDataStudioLayout = (storeOptions: StoreStateOptions = {}) => {
  renderWithProviders(
    <DataStudioLayout>
      <div data-testid="content">{"Content"}</div>
    </DataStudioLayout>,
    {
      storeInitialState: createStoreState(storeOptions),
      withRouter: false,
    },
  );

  initializePlugins();
};

// ============================================================================
// Setup function
// ============================================================================

interface SetupOpts {
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  isAdmin?: boolean;
  hasDirtyChanges?: boolean;
  hasTransformDirtyChanges?: boolean;
  remoteSyncTransforms?: boolean;
  isNavbarOpened?: boolean;
}

export const setup = ({
  remoteSyncEnabled = true,
  remoteSyncBranch = null,
  isAdmin = true,
  hasDirtyChanges = false,
  hasTransformDirtyChanges = false,
  remoteSyncTransforms = false,
  isNavbarOpened = true,
}: SetupOpts = {}) => {
  // Build collections list
  const collections: Collection[] = [];
  if (hasDirtyChanges) {
    collections.push(createMockLibraryCollection());
  }
  if (hasTransformDirtyChanges) {
    collections.push(createMockTransformsCollection());
  }

  // Build dirty entities list
  const dirty: RemoteSyncEntity[] = [];
  if (hasDirtyChanges) {
    dirty.push(createMockDirtyCardEntity());
  }
  if (hasTransformDirtyChanges) {
    dirty.push(createMockDirtyTransformEntity());
  }

  const remoteSyncSettings: Partial<RemoteSyncSettings> = {
    enabled: remoteSyncEnabled,
    branch: remoteSyncBranch,
    type: "read-write",
    transforms: remoteSyncTransforms,
  };

  setupSettingsEndpoints([]);
  setupRemoteSyncSettingsEndpoints(remoteSyncSettings);
  setupDirtyEndpoints({ dirty, collections });
  setupNavbarEndpoints(isNavbarOpened);

  renderDataStudioLayout({
    isAdmin,
    remoteSyncSettings,
  });
};
