import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
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
  testConnectionError,
  envSettings = [],
  isDevInstance,
  upsellDismissed,
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
  testConnectionError?: { status: number; message: string };
  envSettings?: EnterpriseSettingKey[];
  isDevInstance?: boolean;
  upsellDismissed?: boolean;
} = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": remoteSyncEnabled,
    "remote-sync-url": remoteSyncUrl,
    "remote-sync-token": remoteSyncToken,
    "remote-sync-type": remoteSyncType,
    "remote-sync-branch": remoteSyncBranch,
    "remote-sync-auto-import": remoteSyncAutoImport,
    "remote-sync-transforms": remoteSyncTransforms,
    "development-mode?": isDevInstance,
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
    ...(testConnectionError && { testConnectionError }),
  });
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-remote-sync-dev-instance",
    value: !!upsellDismissed,
  });

  fetchMock.get("express:/api/ee/library", libraryCollection ?? { data: null });

  setupRootCollectionItemsEndpoint({ rootCollectionItems });
};

const createStoreState = ({
  isAdmin = true,
  isDevInstance = false,
  remoteSyncEnabled = false,
  remoteSyncType = "read-only" as const,
}: {
  isAdmin?: boolean;
  isDevInstance?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncType?: "read-only" | "read-write";
} = {}) => {
  return createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "development-mode?": isDevInstance,
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
  testConnectionError?: { status: number; message: string };
  envSettings?: EnterpriseSettingKey[];
  isDevInstance?: boolean;
  upsellDismissed?: boolean;
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
  testConnectionError,
  envSettings = [],
  isDevInstance = false,
  upsellDismissed = false,
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
    testConnectionError,
    envSettings,
    isDevInstance,
    upsellDismissed,
  });

  renderWithProviders(
    <RemoteSyncSettingsForm onCancel={onCancel} variant={variant} />,
    {
      storeInitialState: createStoreState({
        isDevInstance,
        remoteSyncEnabled,
        remoteSyncType,
      }),
    },
  );
};
