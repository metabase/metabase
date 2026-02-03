import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  Collection,
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
import { createMockState } from "metabase-types/store/mocks";

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

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

export const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const setupRemoteSyncSettingsEndpoints = (
  settings: Partial<RemoteSyncSettings> = {},
  tokenFeatures?: Partial<TokenFeatures>,
) => {
  const remoteSyncSettings = createRemoteSyncSettings(settings);
  setupPropertiesEndpoints(
    createMockSettings({
      ...remoteSyncSettings,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  );
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
  tokenFeatures?: Partial<TokenFeatures>;
}

const createStoreState = ({
  isAdmin = true,
  remoteSyncSettings = {},
  tokenFeatures,
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
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });
};

interface SetupOpts {
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  isAdmin?: boolean;
  hasDirtyChanges?: boolean;
  hasTransformDirtyChanges?: boolean;
  remoteSyncTransforms?: boolean;
  isNavbarOpened?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
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
  enterprisePlugins,
  tokenFeatures,
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
  setupRemoteSyncSettingsEndpoints(remoteSyncSettings, tokenFeatures);
  setupDirtyEndpoints({ dirty, collections, hasWorkspacesFeature });
  setupNavbarEndpoints(isNavbarOpened);
  setupLibraryEndpoints(false);

  const state = createStoreState({
    isAdmin,
    remoteSyncSettings,
    tokenFeatures,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const hasUpsell = !remoteSyncEnabled;

  if (hasUpsell) {
    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <DataStudioLayout>
            <div data-testid="content">{"Content"}</div>
          </DataStudioLayout>
        )}
      />,
      {
        storeInitialState: state,
        withRouter: true,
      },
    );
  } else {
    renderWithProviders(
      <DataStudioLayout>
        <div data-testid="content">{"Content"}</div>
      </DataStudioLayout>,
      {
        storeInitialState: state,
        withRouter: false,
      },
    );
  }
};

export const DEFAULT_EE_SETTINGS: Partial<SetupOpts> = {
  enterprisePlugins: [
    "library",
    "remote_sync",
    "dependencies",
    "feature_level_permissions",
  ],
  tokenFeatures: {
    remote_sync: true,
    advanced_permissions: true,
    data_studio: true,
    dependencies: true,
  },
};
