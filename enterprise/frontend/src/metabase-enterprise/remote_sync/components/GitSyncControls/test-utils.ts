import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { RemoteSyncEntity } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export const setupCollectionEndpoints = () => {
  fetchMock.get("path:/api/collection/tree", []);
};

export const setupSessionEndpoints = ({
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
}: {
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
} = {}) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  );
  setupSettingsEndpoints([]);
};

export const createRemoteSyncStoreState = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
} = {}) => {
  return createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  });
};

export const createMockDirtyEntity = (
  overrides: Partial<RemoteSyncEntity> = {},
): RemoteSyncEntity => ({
  id: 1,
  name: "Test Card",
  model: "card",
  sync_status: "update",
  collection_id: 1,
  ...overrides,
});
