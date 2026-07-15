import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupGetCurrentWorkspaceEndpoint,
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type {
  Collection,
  CurrentWorkspace,
  RemoteSyncEntity,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockDirtyCardEntity,
  createMockDirtyTransformEntity,
  createMockLibraryCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransformsCollection,
  createMockUser,
} from "metabase-types/api/mocks";

import { DataStudioLayout } from "../DataStudioLayout";

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

const setupRemoteSyncSettingsEndpoints = (
  settings: Partial<RemoteSyncSettings> = {},
  {
    tokenFeatures,
    transformsEnabled = false,
    transformsSetupComplete = false,
  }: Pick<
    StoreStateOptions,
    "tokenFeatures" | "transformsEnabled" | "transformsSetupComplete"
  > = {},
) => {
  setupPropertiesEndpoints(
    createSettingsValues({
      remoteSyncSettings: settings,
      tokenFeatures,
      transformsEnabled,
      transformsSetupComplete,
    }),
  );
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
  canAccessTransforms?: boolean;
  remoteSyncSettings?: Partial<RemoteSyncSettings>;
  tokenFeatures?: Partial<TokenFeatures>;
  transformsEnabled?: boolean;
  transformsSetupComplete?: boolean;
}

const createSettingsValues = ({
  remoteSyncSettings = {},
  tokenFeatures,
  transformsEnabled = false,
  transformsSetupComplete = false,
}: Pick<
  StoreStateOptions,
  | "remoteSyncSettings"
  | "tokenFeatures"
  | "transformsEnabled"
  | "transformsSetupComplete"
> = {}) =>
  createMockSettings({
    ...createRemoteSyncSettings(remoteSyncSettings),
    "transforms-enabled": transformsEnabled,
    "transforms-setup-complete": transformsSetupComplete,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

const createStoreState = ({
  isAdmin = true,
  canAccessTransforms = false,
  remoteSyncSettings = {},
  tokenFeatures,
  transformsEnabled = false,
  transformsSetupComplete = false,
}: StoreStateOptions = {}) => {
  return createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: isAdmin,
        can_access_db_details: false,
        can_access_transforms: canAccessTransforms,
      },
    }),
    settings: mockSettings(
      createSettingsValues({
        remoteSyncSettings,
        tokenFeatures,
        transformsEnabled,
        transformsSetupComplete,
      }),
    ),
  });
};

interface SetupOpts {
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  isAdmin?: boolean;
  canAccessTransforms?: boolean;
  currentWorkspace?: CurrentWorkspace | null;
  hasDirtyChanges?: boolean;
  hasTransformDirtyChanges?: boolean;
  remoteSyncTransforms?: boolean;
  isNavbarOpened?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
  transformsEnabled?: boolean;
  transformsSetupComplete?: boolean;
}

export const setup = ({
  remoteSyncEnabled = true,
  remoteSyncBranch = null,
  isAdmin = true,
  canAccessTransforms = false,
  currentWorkspace = null,
  hasDirtyChanges = false,
  hasTransformDirtyChanges = false,
  remoteSyncTransforms = false,
  isNavbarOpened = true,
  enterprisePlugins,
  tokenFeatures,
  transformsEnabled = false,
  transformsSetupComplete = false,
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
  setupRemoteSyncSettingsEndpoints(remoteSyncSettings, {
    tokenFeatures,
    transformsEnabled,
    transformsSetupComplete,
  });
  setupDirtyEndpoints({ dirty, collections });
  setupNavbarEndpoints(isNavbarOpened);
  setupLibraryEndpoints(false);
  setupGetCurrentWorkspaceEndpoint(currentWorkspace);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-remote-sync-dev-instance",
    value: false,
  });

  const state = createStoreState({
    isAdmin,
    canAccessTransforms,
    remoteSyncSettings,
    tokenFeatures,
    transformsEnabled,
    transformsSetupComplete,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <Route path="/" element={<DataStudioLayout />}>
      <Route index element={<div data-testid="content">{"Content"}</div>} />
    </Route>,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
};

export const DEFAULT_EE_SETTINGS: Partial<SetupOpts> = {
  enterprisePlugins: [
    "library",
    "remote_sync",
    "dependencies",
    "feature_level_permissions",
    "workspaces",
  ],
  tokenFeatures: {
    remote_sync: true,
    advanced_permissions: true,
    library: true,
    dependencies: true,
    "schema-viewer": true,
    workspaces: true,
  },
};
