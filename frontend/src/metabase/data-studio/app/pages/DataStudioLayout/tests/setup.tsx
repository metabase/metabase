import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { Route } from "metabase/router";
import type { RemoteSyncDirtyItem, TokenFeatures } from "metabase-types/api";
import {
  createMockLibraryCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransformsCollection,
  createMockUser,
} from "metabase-types/api/mocks";

import { DataStudioLayout } from "../DataStudioLayout";

interface SetupOpts {
  remoteSyncBranch?: string | null;
  dirty?: RemoteSyncDirtyItem[];
  isAdmin?: boolean;
  canAccessTransforms?: boolean;
  isNavbarOpened?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
  transformsEnabled?: boolean;
  transformsSetupComplete?: boolean;
}

export const setup = ({
  remoteSyncBranch = null,
  dirty = [],
  isAdmin = true,
  canAccessTransforms = false,
  isNavbarOpened = true,
  enterprisePlugins,
  tokenFeatures,
  transformsEnabled = false,
  transformsSetupComplete = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": remoteSyncBranch != null,
    "remote-sync-branch": remoteSyncBranch,
    "remote-sync-type": "read-write",
    "transforms-enabled": transformsEnabled,
    "transforms-setup-complete": transformsSetupComplete,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupCollectionsEndpoints({
    collections: [
      createMockLibraryCollection(),
      createMockTransformsCollection(),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: { id: "root" },
    collectionItems: [],
  });
  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "isNavbarOpened",
    value: isNavbarOpened,
  });
  setupLibraryEndpoints({ hasLibrary: false });
  setupRemoteSyncEndpoints({ dirty });

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: isAdmin,
        can_access_db_details: false,
        can_access_transforms: canAccessTransforms,
      },
    }),
    settings: mockSettings(settings),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <Route path="/" element={<DataStudioLayout />}>
      <Route index element={<div data-testid="content">{"Content"}</div>} />
    </Route>,
    { storeInitialState: state, withRouter: true },
  );
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
    library: true,
    dependencies: true,
    "schema-viewer": true,
  },
};
