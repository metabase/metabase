import { useMemo } from "react";
import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { CollectionItem } from "metabase-types/api";

import { CollectionSyncList } from "../CollectionSyncList";

export const TopLevelCollectionsList = () => {
  const { data, isLoading, error } = useListCollectionItemsQuery({
    id: "root",
    models: ["collection"],
  });

  const { data: libraryCollectionData, isLoading: isLoadingLibrary } =
    useGetLibraryCollectionQuery();

  // Library collection endpoint returns { data: null } when not found
  const libraryCollection: CollectionItem | undefined =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;

  // Filter out personal collections and analytics collections, combine with library collection
  const collections = useMemo(() => {
    const topLevelCollections = (data?.data ?? []).filter(
      (c) => !c.personal_owner_id && c.type !== "instance-analytics",
    );

    // Add library collection at the beginning if it exists
    if (libraryCollection) {
      return [libraryCollection, ...topLevelCollections];
    }

    return topLevelCollections;
  }, [data, libraryCollection]);

  return (
    <CollectionSyncList
      collections={collections}
      emptyMessage={t`No collections found`}
      error={error ? t`Failed to load collections` : null}
      isLoading={isLoading || isLoadingLibrary}
      showTransformsRow={PLUGIN_TRANSFORMS.isEnabled}
    />
  );
};
