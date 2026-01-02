import fetchMock from "fetch-mock";

import {
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
import type { RemoteSyncEntity } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockRemoteSyncEntity } from "metabase-types/api/mocks/remote-sync";
import { createMockState } from "metabase-types/store/mocks";

import { DataStudioLayout } from "./DataStudioLayout";

interface SetupEndpointsOpts {
  isNavbarOpened?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  remoteSyncType?: "read-only" | "read-write";
  hasDirtyChanges?: boolean;
}

const setupEndpoints = ({
  isNavbarOpened = true,
  remoteSyncEnabled = false,
  remoteSyncBranch = null,
  remoteSyncType = "read-write",
  hasDirtyChanges = false,
}: SetupEndpointsOpts = {}) => {
  // Mock session properties for settings (used by useAdminSetting and useSetting)
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": remoteSyncBranch,
      "remote-sync-type": remoteSyncType,
    }),
  );

  // Mock settings details endpoint
  setupSettingsEndpoints([]);

  // Mock collection tree endpoint (used by useHasLibraryDirtyChanges)
  fetchMock.get("path:/api/collection/tree", () => {
    if (hasDirtyChanges) {
      return [
        createMockCollection({
          id: 1,
          name: "Library",
          type: "library",
        }),
      ];
    }
    return [];
  });

  const dirty: RemoteSyncEntity[] = hasDirtyChanges
    ? [createMockRemoteSyncEntity({ id: 1, model: "card", collection_id: 1 })]
    : [];
  const branches = remoteSyncBranch ? [remoteSyncBranch] : [];
  setupRemoteSyncEndpoints({ dirty, branches });

  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "isNavbarOpened",
    value: isNavbarOpened,
  });

  // Mock user key value PUT endpoint
  fetchMock.put(
    "express:/api/user-key-value/namespace/data_studio/key/isNavbarOpened",
    { status: 200 },
  );
};

const createStoreState = ({
  isAdmin = true,
  remoteSyncEnabled = false,
  remoteSyncBranch = null as string | null,
  remoteSyncType = "read-write" as "read-only" | "read-write",
  canAccessDataModel = true,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  remoteSyncType?: "read-only" | "read-write";
  canAccessDataModel?: boolean;
} = {}) => {
  return createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: canAccessDataModel,
        can_access_db_details: false,
      },
    }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": remoteSyncBranch,
      "remote-sync-type": remoteSyncType,
      "token-features": createMockTokenFeatures({
        remote_sync: true,
        advanced_permissions: true,
      }),
    }),
  });
};

interface SetupOpts {
  isGitSyncVisible?: boolean;
  isGitSettingsVisible?: boolean;
  isAdmin?: boolean;
  hasDirtyChanges?: boolean;
  isNavbarOpened?: boolean;
}

export const setup = ({
  isGitSyncVisible = false,
  isGitSettingsVisible = false,
  isAdmin = true,
  hasDirtyChanges = false,
  isNavbarOpened = true,
}: SetupOpts = {}) => {
  // Derive API state from the visibility flags
  // useGitSyncVisible returns isVisible when: isAdmin && remoteSyncEnabled && currentBranch && syncType === "read-write"
  // useGitSettingsVisible returns true when: isAdmin && !remoteSyncEnabled
  let remoteSyncEnabled: boolean;
  let remoteSyncBranch: string | null;
  const remoteSyncType = "read-write" as const;

  if (isGitSyncVisible) {
    // Git sync visible requires: enabled + branch + admin + read-write
    remoteSyncEnabled = true;
    remoteSyncBranch = "main";
  } else if (isGitSettingsVisible) {
    // Git settings visible requires: admin + NOT enabled
    remoteSyncEnabled = false;
    remoteSyncBranch = null;
  } else {
    // Neither visible - could be enabled with no branch, or not admin
    remoteSyncEnabled = true;
    remoteSyncBranch = null;
  }

  setupEndpoints({
    isNavbarOpened,
    remoteSyncEnabled,
    remoteSyncBranch,
    remoteSyncType,
    hasDirtyChanges,
  });

  renderWithProviders(
    <DataStudioLayout>
      <div data-testid="content">{"Content"}</div>
    </DataStudioLayout>,
    {
      storeInitialState: createStoreState({
        isAdmin,
        remoteSyncEnabled,
        remoteSyncBranch,
        remoteSyncType,
        canAccessDataModel: isAdmin,
      }),
      withRouter: false,
    },
  );

  initializeRemoteSyncPlugin();
  initializeFeatureLevelPermissionsPlugin();
  initializeTransformsPlugin();
  initializeDependenciesPlugin();
};
