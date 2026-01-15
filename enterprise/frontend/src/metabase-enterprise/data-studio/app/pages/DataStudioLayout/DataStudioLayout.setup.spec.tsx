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

export const setupBaseEndpoints = () => {
  setupSettingsEndpoints([]);
};

export const setupRemoteSyncSettingsEndpoints = (
  settings: Partial<RemoteSyncSettings> = {},
) => {
  const remoteSyncSettings = createRemoteSyncSettings(settings);
  setupPropertiesEndpoints(createMockSettings(remoteSyncSettings));
};

export const setupGitSyncVisibleEndpoints = (
  settings: Partial<Omit<RemoteSyncSettings, "enabled" | "branch">> = {},
) => {
  setupRemoteSyncSettingsEndpoints({
    enabled: true,
    branch: "main",
    type: "read-write",
    ...settings,
  });
};

export const setupGitSettingsVisibleEndpoints = () => {
  setupRemoteSyncSettingsEndpoints({
    enabled: false,
    branch: null,
  });
};

export const setupDirtyEndpoints = ({
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

export const setupNavbarEndpoints = (isOpened = true) => {
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

export const createStoreState = ({
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

export const initializePlugins = () => {
  initializeRemoteSyncPlugin();
  initializeFeatureLevelPermissionsPlugin();
  initializeTransformsPlugin();
  initializeDependenciesPlugin();
};

// ============================================================================
// Render Helper
// ============================================================================

export const renderDataStudioLayout = (
  storeOptions: StoreStateOptions = {},
) => {
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
// Convenience Setup Functions (for common test scenarios)
// ============================================================================

export const setupForGitSyncVisible = ({
  isNavbarOpened = true,
  dirty = [] as RemoteSyncEntity[],
  collections = [] as Collection[],
  transforms = false,
}: {
  isNavbarOpened?: boolean;
  dirty?: RemoteSyncEntity[];
  collections?: Collection[];
  transforms?: boolean;
} = {}) => {
  setupBaseEndpoints();
  setupGitSyncVisibleEndpoints({ transforms });
  setupDirtyEndpoints({ dirty, collections });
  setupNavbarEndpoints(isNavbarOpened);

  renderDataStudioLayout({
    remoteSyncSettings: {
      enabled: true,
      branch: "main",
      type: "read-write",
      transforms,
    },
  });
};

export const setupForGitSettingsVisible = ({
  isNavbarOpened = true,
}: {
  isNavbarOpened?: boolean;
} = {}) => {
  setupBaseEndpoints();
  setupGitSettingsVisibleEndpoints();
  setupDirtyEndpoints();
  setupNavbarEndpoints(isNavbarOpened);

  renderDataStudioLayout({
    remoteSyncSettings: {
      enabled: false,
      branch: null,
    },
  });
};

// ============================================================================
// Legacy setup function (for backwards compatibility during migration)
// ============================================================================

interface SetupOpts {
  isGitSyncVisible?: boolean;
  isGitSettingsVisible?: boolean;
  isAdmin?: boolean;
  hasDirtyChanges?: boolean;
  hasTransformDirtyChanges?: boolean;
  remoteSyncTransforms?: boolean;
  isNavbarOpened?: boolean;
}

export const setup = ({
  isGitSyncVisible = false,
  isGitSettingsVisible = false,
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

  // Determine remote sync settings from visibility flags
  let remoteSyncEnabled: boolean;
  let remoteSyncBranch: string | null;

  if (isGitSyncVisible) {
    remoteSyncEnabled = true;
    remoteSyncBranch = "main";
  } else if (isGitSettingsVisible) {
    remoteSyncEnabled = false;
    remoteSyncBranch = null;
  } else {
    remoteSyncEnabled = true;
    remoteSyncBranch = null;
  }

  const remoteSyncSettings: Partial<RemoteSyncSettings> = {
    enabled: remoteSyncEnabled,
    branch: remoteSyncBranch,
    type: "read-write",
    transforms: remoteSyncTransforms,
  };

  setupBaseEndpoints();
  setupRemoteSyncSettingsEndpoints(remoteSyncSettings);
  setupDirtyEndpoints({ dirty, collections });
  setupNavbarEndpoints(isNavbarOpened);

  renderDataStudioLayout({
    isAdmin,
    remoteSyncSettings,
  });
};
