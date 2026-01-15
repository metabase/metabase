import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  RemoteSyncSettingsForm,
  type RemoteSyncSettingsFormProps,
} from "./RemoteSyncSettingsForm";

export const createMockLibraryCollection = (
  overrides?: Partial<Collection>,
): Collection =>
  createMockCollection({
    id: 999,
    name: "Library",
    type: "library",
    ...overrides,
  });

const setupEndpoints = ({
  remoteSyncEnabled = false,
  remoteSyncUrl = "",
  remoteSyncToken = "",
  remoteSyncType = "read-only" as const,
  remoteSyncBranch = "main",
  remoteSyncAutoImport = false,
  remoteSyncTransforms = false,
  libraryCollection = null as Collection | null,
  dirty = [] as any[],
}: {
  remoteSyncEnabled?: boolean;
  remoteSyncUrl?: string;
  remoteSyncToken?: string;
  remoteSyncType?: "read-only" | "read-write";
  remoteSyncBranch?: string;
  remoteSyncAutoImport?: boolean;
  remoteSyncTransforms?: boolean;
  libraryCollection?: Collection | null;
  dirty?: any[];
} = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": remoteSyncEnabled,
    "remote-sync-url": remoteSyncUrl,
    "remote-sync-token": remoteSyncToken,
    "remote-sync-type": remoteSyncType,
    "remote-sync-branch": remoteSyncBranch,
    "remote-sync-auto-import": remoteSyncAutoImport,
    "remote-sync-transforms": remoteSyncTransforms,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupRemoteSyncEndpoints({ dirty, branches: [remoteSyncBranch] });

  fetchMock.get("express:/api/ee/library", libraryCollection ?? { data: null });

  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
};

const createStoreState = ({
  isAdmin = true,
  remoteSyncEnabled = false,
  remoteSyncType = "read-only" as const,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncType?: "read-only" | "read-write";
} = {}) => {
  return createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-type": remoteSyncType,
    }),
  });
};

interface SetupOpts {
  onCancel?: () => void;
  remoteSyncEnabled?: boolean;
  remoteSyncUrl?: string;
  remoteSyncToken?: string;
  remoteSyncType?: "read-only" | "read-write";
  remoteSyncBranch?: string;
  remoteSyncTransforms?: boolean;
  libraryCollection?: Collection | null;
  dirty?: any[];
  variant?: RemoteSyncSettingsFormProps["variant"];
}

export const setup = ({
  onCancel,
  remoteSyncEnabled = false,
  remoteSyncUrl = "",
  remoteSyncToken = "",
  remoteSyncType = "read-only",
  remoteSyncBranch = "main",
  remoteSyncTransforms = false,
  libraryCollection = null,
  dirty = [],
  variant,
}: SetupOpts = {}) => {
  setupEndpoints({
    remoteSyncEnabled,
    remoteSyncUrl,
    remoteSyncToken,
    remoteSyncType,
    remoteSyncBranch,
    remoteSyncTransforms,
    libraryCollection,
    dirty,
  });

  renderWithProviders(
    <RemoteSyncSettingsForm onCancel={onCancel} variant={variant} />,
    {
      storeInitialState: createStoreState({
        remoteSyncEnabled,
        remoteSyncType,
      }),
    },
  );
};
