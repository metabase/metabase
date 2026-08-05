import { useMemo } from "react";

import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useSetting,
} from "metabase/settings";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { LibraryCollection } from "metabase-types/api";

import {
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  SYNC_LIBRARY_PENDING_KEY,
  TOKEN_KEY,
  TRANSFORMS_KEY,
} from "../constants";
import type {
  RemoteSyncSettingsFormState,
  RemoteSyncSettingsVariant,
} from "../types";

export const useRemoteSyncInitialValues = (
  variant: RemoteSyncSettingsVariant,
) => {
  const isModalVariant = variant === "settings-modal";
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const useTenants = useSetting("use-tenants");

  const { data: topLevelCollectionsData } = useListCollectionItemsQuery(
    { id: "root", models: ["collection"] },
    { skip: !isRemoteSyncEnabled },
  );

  // The modal always fetches so its toggles can default to checked.
  const { data: libraryCollectionData } = useGetLibraryCollectionQuery(
    undefined,
    { skip: !isRemoteSyncEnabled && !isModalVariant },
  );

  // Library collection endpoint returns { data: null } when not found
  const libraryCollection: LibraryCollection | undefined =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;

  const { data: tenantCollectionsData } = useListCollectionItemsQuery(
    { id: "root", namespace: "shared-tenant-collection" },
    { skip: !isRemoteSyncEnabled || !useTenants },
  );

  const initialValues: RemoteSyncSettingsFormState = useMemo(() => {
    const values = REMOTE_SYNC_SCHEMA.cast(settingValues, {
      stripUnknown: true,
    });
    const tokenValue =
      settingDetails?.[TOKEN_KEY]?.value ?? settingValues?.[TOKEN_KEY];

    const collectionSyncMap: Record<number, boolean> = {};
    const shouldDefaultToChecked = isModalVariant && !isRemoteSyncEnabled;

    if (libraryCollection) {
      collectionSyncMap[libraryCollection.id] = shouldDefaultToChecked
        ? true
        : (libraryCollection.is_remote_synced ?? false);
    }

    topLevelCollectionsData?.data
      ?.filter((collection) => !collection.personal_owner_id)
      .forEach((collection) => {
        collectionSyncMap[collection.id] = collection.is_remote_synced ?? false;
      });

    tenantCollectionsData?.data?.forEach((collection) => {
      collectionSyncMap[collection.id] = collection.is_remote_synced ?? false;
    });

    return {
      ...values,
      [TOKEN_KEY]: tokenValue,
      [COLLECTIONS_KEY]: collectionSyncMap,
      [TRANSFORMS_KEY]:
        shouldDefaultToChecked && PLUGIN_TRANSFORMS.isEnabled
          ? true
          : values[TRANSFORMS_KEY],
      [SYNC_LIBRARY_PENDING_KEY]: shouldDefaultToChecked && !libraryCollection,
    };
  }, [
    settingValues,
    settingDetails,
    libraryCollection,
    topLevelCollectionsData,
    tenantCollectionsData,
    isModalVariant,
    isRemoteSyncEnabled,
  ]);

  return { initialValues, libraryCollection };
};
