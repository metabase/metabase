import type {
  EnterpriseSettings,
  RegularCollectionId,
  TestRemoteSyncConnectionRequest,
  UpdateRemoteSyncSettingsRequest,
} from "metabase-types/api";

import type { SettingsFormValues, SyncableCollection } from "../../types";

export function getInitialValues(
  settings: EnterpriseSettings,
  collections: SyncableCollection[],
): SettingsFormValues {
  return {
    url: settings["remote-sync-url"] ?? "",
    token: settings["remote-sync-token"] ?? "",
    type: settings["remote-sync-type"] ?? "read-write",
    branch: settings["remote-sync-branch"] ?? "",
    autoImport: Boolean(settings["remote-sync-auto-import"]),
    collections: Object.fromEntries(
      collections.map((collection) => [
        collection.id,
        collection.isRemoteSynced,
      ]),
    ),
  };
}

export function getConnectionRequest(
  values: SettingsFormValues,
): TestRemoteSyncConnectionRequest {
  return {
    "remote-sync-url": values.url,
    "remote-sync-token": values.token || undefined,
  };
}

export function getSettingsRequest(
  values: SettingsFormValues,
  collections: Record<RegularCollectionId, boolean> | null,
): UpdateRemoteSyncSettingsRequest {
  return {
    ...getConnectionRequest(values),
    "remote-sync-type": values.type,
    "remote-sync-branch": values.branch || null,
    "remote-sync-auto-import": values.autoImport,
    collections,
  };
}
