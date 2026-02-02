import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
  setupWorkspacesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { initializePlugin as initializeDependenciesPlugin } from "metabase-enterprise/dependencies";
import { initializePlugin as initializeFeatureLevelPermissionsPlugin } from "metabase-enterprise/feature_level_permissions";
import { initializePlugin as initializeRemoteSyncPlugin } from "metabase-enterprise/remote_sync";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { initializePlugin as initializeTransformsPlugin } from "metabase-enterprise/transforms";
import { reinitialize } from "metabase/plugins";
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
  data_studio: true,
  dependencies: true,
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

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

export const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

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
  hasWorkspacesFeature = false,
}: {
  dirty?: RemoteSyncEntity[];
  collections?: Collection[];
  hasWorkspacesFeature?: boolean;
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

  mockHasPremiumFeature.mockImplementation((feature) => {
    if (feature === "workspaces") {
      return hasWorkspacesFeature;
    }
    // Allow other features to pass (e.g., remote_sync for git sync tests)
    return true;
  });

  if (hasWorkspacesFeature) {
    setupWorkspacesEndpoint([]);
  }
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
// Render Helper
// ============================================================================

const renderDataStudioLayout = (storeOptions: StoreStateOptions = {}) => {
  // Create store state first - this calls mockSettings() which sets up MetabaseSettings
  const storeInitialState = createStoreState(storeOptions);

  // Reinitialize plugins to default state, then setup enterprise plugins
  reinitialize();
  setupEnterprisePlugins();

  renderWithProviders(
    <DataStudioLayout>
      <div data-testid="content">{"Content"}</div>
    </DataStudioLayout>,
    {
      storeInitialState,
      withRouter: false,
    },
  );
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
  hasWorkspacesFeature?: boolean;
}

export const setup = ({
  remoteSyncEnabled = true,
  remoteSyncBranch = null,
  isAdmin = true,
  hasDirtyChanges = false,
  hasTransformDirtyChanges = false,
  remoteSyncTransforms = false,
  isNavbarOpened = true,
  hasWorkspacesFeature = false,
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
  setupDirtyEndpoints({ dirty, collections, hasWorkspacesFeature });
  setupNavbarEndpoints(isNavbarOpened);
  setupLibraryEndpoints(false);

  renderDataStudioLayout({
    isAdmin,
    remoteSyncSettings,
  });
};
