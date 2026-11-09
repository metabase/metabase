import { useMemo } from "react";

import { useListCollectionItemsQuery } from "metabase/api";
import { useAdminSetting, useSetting } from "metabase/settings";
import type {
  CollectionId,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { SettingsFormValues, SyncableCollection } from "../../types";

const ROOT_COLLECTIONS_REQUEST: ListCollectionItemsRequest = {
  id: "root",
  models: ["collection"],
  "include-library": true,
};

const TENANT_COLLECTIONS_REQUEST: ListCollectionItemsRequest = {
  id: "root",
  namespace: "shared-tenant-collection",
  models: ["collection"],
};

type CollectionLike = {
  id: CollectionId;
  name: string;
  is_remote_synced?: boolean;
};

const toSyncableCollections = (
  collections: CollectionLike[],
): SyncableCollection[] =>
  collections.flatMap(({ id, name, is_remote_synced }) =>
    typeof id === "number"
      ? [{ id, name, isRemoteSynced: Boolean(is_remote_synced) }]
      : [],
  );

export type SyncableCollections = {
  isLoading: boolean;
  library: SyncableCollection | null;
  regularCollections: SyncableCollection[];
  tenantCollections: SyncableCollection[];
};

export const useSyncableCollections = (): SyncableCollections => {
  const isTenantsEnabled = useSetting("use-tenants");
  const { data: rootItems, isLoading: isLoadingCollections } =
    useListCollectionItemsQuery(ROOT_COLLECTIONS_REQUEST);
  const { data: tenantItems, isLoading: isLoadingTenantCollections } =
    useListCollectionItemsQuery(TENANT_COLLECTIONS_REQUEST, {
      skip: !isTenantsEnabled,
    });

  return useMemo(() => {
    const collections = rootItems?.data ?? [];
    const library = collections.filter(
      (collection) => collection.type === "library",
    );
    const regularCollections = collections.filter(
      (collection) =>
        collection.type !== "library" && collection.personal_owner_id == null,
    );
    return {
      isLoading: isLoadingCollections || isLoadingTenantCollections,
      library: toSyncableCollections(library)[0] ?? null,
      regularCollections: toSyncableCollections(regularCollections),
      tenantCollections: toSyncableCollections(tenantItems?.data ?? []),
    };
  }, [
    rootItems,
    tenantItems,
    isLoadingCollections,
    isLoadingTenantCollections,
  ]);
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

  return useMemo(
    () => ({
      "remote-sync-url": url ?? "",
      "remote-sync-token": token ?? "",
      "remote-sync-type": syncType ?? "read-write",
      "remote-sync-branch": branch ?? "",
      "remote-sync-auto-import": Boolean(autoImport),
      library: isEnabled ? Boolean(library?.isRemoteSynced) : true,
      collections: Object.fromEntries(
        collections.map((collection) => [
          collection.id,
          collection.isRemoteSynced,
        ]),
      ),
    }),
    [isEnabled, url, token, syncType, branch, autoImport, library, collections],
  );
};
