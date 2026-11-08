import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { useAdminSetting } from "metabase/settings";

import type { SettingsFormValues, SyncableCollection } from "../../types";

export const useSyncableCollections = (): SyncableCollection[] => {
  const { data: collections = [] } = useListCollectionsQuery({
    archived: false,
  });

  return useMemo(
    () =>
      collections.flatMap((collection) =>
        typeof collection.id === "number" &&
        collection.location === "/" &&
        collection.namespace == null &&
        collection.personal_owner_id == null
          ? [
              {
                id: collection.id,
                name: collection.name,
                isRemoteSynced: Boolean(collection.is_remote_synced),
              },
            ]
          : [],
      ),
    [collections],
  );
};

export const useSettingsFormValues = (
  collections: SyncableCollection[],
): SettingsFormValues => {
  const { value: url } = useAdminSetting("remote-sync-url");
  const { value: token } = useAdminSetting("remote-sync-token");
  const { value: syncType } = useAdminSetting("remote-sync-type");
  const { value: branch } = useAdminSetting("remote-sync-branch");
  const { value: autoImport } = useAdminSetting("remote-sync-auto-import");
  const { value: transforms } = useAdminSetting("remote-sync-transforms");

  return useMemo(
    () => ({
      "remote-sync-url": url ?? "",
      "remote-sync-token": token ?? "",
      "remote-sync-type": syncType ?? "read-write",
      "remote-sync-branch": branch ?? "",
      "remote-sync-auto-import": Boolean(autoImport),
      "remote-sync-transforms": Boolean(transforms),
      collections: Object.fromEntries(
        collections.map((collection) => [
          collection.id,
          collection.isRemoteSynced,
        ]),
      ),
    }),
    [url, token, syncType, branch, autoImport, transforms, collections],
  );
};
