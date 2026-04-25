import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  Collection,
  CollectionItem,
  EnterpriseSettingKey,
  SettingDefinition,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

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
  rootCollectionItems = [] as CollectionItem[],
  settingsError,
  envSettings = [],
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
  rootCollectionItems?: CollectionItem[];
  settingsError?: { status: number; message: string };
  envSettings?: EnterpriseSettingKey[];
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

  const settingDefinitions: SettingDefinition[] = envSettings.map((key) =>
    createMockSettingDefinition({
      key,
      value: settings[key],
      is_env_setting: true,
      env_name: `MB_${key.toUpperCase().replace(/-/g, "_")}`,
    } as SettingDefinition),
  );

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(settingDefinitions);
  setupRemoteSyncEndpoints({
    dirty,
    branches: [remoteSyncBranch],
    ...(settingsError && {
      settingsResponse: { error: settingsError },
    }),
  });

  fetchMock.get("express:/api/ee/library", libraryCollection ?? { data: null });

  setupRootCollectionItemsEndpoint({ rootCollectionItems });
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
  rootCollectionItems?: CollectionItem[];
  variant?: RemoteSyncSettingsFormProps["variant"];
  settingsError?: { status: number; message: string };
  envSettings?: EnterpriseSettingKey[];
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
  rootCollectionItems = [],
  variant,
  settingsError,
  envSettings = [],
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
    rootCollectionItems,
    settingsError,
    envSettings,
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
