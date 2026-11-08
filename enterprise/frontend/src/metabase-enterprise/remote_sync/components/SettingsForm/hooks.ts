import { useMemo } from "react";

import {
  useListCollectionItemsQuery,
  useListCollectionsQuery,
} from "metabase/api";
import { useAdminSetting, useSetting } from "metabase/settings";

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
        collection.type !== "library" &&
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

export const useLibraryCollection = (): SyncableCollection | null => {
  const { data: collections = [] } = useListCollectionsQuery({
    archived: false,
  });

  return useMemo(() => {
    const library = collections.find(
      (collection) => collection.type === "library",
    );
    return library && typeof library.id === "number"
      ? {
          id: library.id,
          name: library.name,
          isRemoteSynced: Boolean(library.is_remote_synced),
        }
      : null;
  }, [collections]);
};

export const useSyncableTenantCollections = (): SyncableCollection[] => {
  const isTenantsEnabled = useSetting("use-tenants");
  const { data: items } = useListCollectionItemsQuery(
    {
      id: "root",
      namespace: "shared-tenant-collection",
      models: ["collection"],
    },
    { skip: !isTenantsEnabled },
  );

  return useMemo(
    () =>
      (items?.data ?? []).flatMap((item) =>
        typeof item.id === "number"
          ? [
              {
                id: item.id,
                name: item.name,
                isRemoteSynced: Boolean(item.is_remote_synced),
              },
            ]
          : [],
      ),
    [items],
  );
};

export const useSettingsFormValues = (
  collections: SyncableCollection[],
  library: SyncableCollection | null,
): SettingsFormValues => {
  const isEnabled = useSetting("remote-sync-enabled");
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
      "remote-sync-transforms": isEnabled ? Boolean(transforms) : true,
      library: isEnabled ? Boolean(library?.isRemoteSynced) : true,
      collections: Object.fromEntries(
        collections.map((collection) => [
          collection.id,
          collection.isRemoteSynced,
        ]),
      ),
    }),
    [
      isEnabled,
      url,
      token,
      syncType,
      branch,
      autoImport,
      transforms,
      library,
      collections,
    ],
  );
};
