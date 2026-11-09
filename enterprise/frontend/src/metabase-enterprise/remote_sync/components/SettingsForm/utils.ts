import type {
  EnterpriseSettings,
  RegularCollectionId,
  TestRemoteSyncConnectionRequest,
  UpdateRemoteSyncSettingsRequest,
} from "metabase-types/api";

import type { SettingsFormValues, SyncableCollection } from "../../types";

export const getInitialValues = (
  settings: EnterpriseSettings,
  collections: SyncableCollection[],
): SettingsFormValues => ({
  url: settings["remote-sync-url"] ?? "",
  token: settings["remote-sync-token"] ?? "",
  type: settings["remote-sync-type"] ?? "read-write",
  branch: settings["remote-sync-branch"] ?? "",
  autoImport: Boolean(settings["remote-sync-auto-import"]),
  collections: Object.fromEntries(
    collections.map((collection) => [collection.id, collection.isRemoteSynced]),
  ),
});

export const getConnectionRequest = (
  values: SettingsFormValues,
): TestRemoteSyncConnectionRequest => ({
  "remote-sync-url": values.url,
  "remote-sync-token": values.token || undefined,
});

export const getSettingsRequest = (
  values: SettingsFormValues,
  collections: Record<RegularCollectionId, boolean> | null,
): UpdateRemoteSyncSettingsRequest => ({
  ...getConnectionRequest(values),
  "remote-sync-type": values.type,
  "remote-sync-branch": values.branch || null,
  "remote-sync-auto-import": values.autoImport,
  collections,
});
