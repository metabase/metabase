import { useMemo } from "react";

import { useListCollectionItemsQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getSettings, useSetting } from "metabase/settings";
import type {
  CollectionId,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { SettingsFormValues, SyncableCollection } from "../../types";

import { getInitialValues } from "./utils";

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

function toSyncableCollections(
  collections: CollectionLike[],
): SyncableCollection[] {
  return collections.flatMap(({ id, name, is_remote_synced }) =>
    typeof id === "number"
      ? [{ id, name, isRemoteSynced: Boolean(is_remote_synced) }]
      : [],
  );
}

export type SyncableCollections = {
  isLoading: boolean;
  library: SyncableCollection | null;
  regularCollections: SyncableCollection[];
  tenantCollections: SyncableCollection[];
};

export function useSyncableCollections(): SyncableCollections {
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
}

export function useSettingsFormValues(
  collections: SyncableCollection[],
): SettingsFormValues {
  const settings = useSelector(getSettings);

  return useMemo(
    () => getInitialValues(settings, collections),
    [settings, collections],
  );
}
