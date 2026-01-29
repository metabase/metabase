import { useMemo } from "react";
import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { CollectionItem } from "metabase-types/api";

import { CollectionSyncList } from "../CollectionSyncList";

interface TopLevelCollectionsListProps {
  /**
   * When true, skip other top-level collections and only show Library and Transforms.
   * Useful for modal variant where only these options should be shown.
   */
  skipCollections?: boolean;
  /**
   * Callback when the library pending toggle changes.
   * Only used when library doesn't exist and skipCollections is true.
   */
  onLibraryPendingChange?: (checked: boolean) => void;
  /**
   * Current state of the library pending toggle.
   * Only used when library doesn't exist and skipCollections is true.
   */
  isLibraryPendingChecked?: boolean;
}

export const TopLevelCollectionsList = ({
  skipCollections,
  onLibraryPendingChange,
  isLibraryPendingChecked,
}: TopLevelCollectionsListProps = {}) => {
  const { data, isLoading, error } = useListCollectionItemsQuery(
    {
      id: "root",
      models: ["collection"],
    },
    { skip: skipCollections },
  );

  const { data: libraryCollectionData, isLoading: isLoadingLibrary } =
    useGetLibraryCollectionQuery();

  // Library collection endpoint returns { data: null } when not found
  const libraryCollection: CollectionItem | undefined =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;

  // Filter out personal collections and analytics collections, combine with library collection
  const collections = useMemo(() => {
    // When skipCollections is true, only show library collection
    if (skipCollections) {
      return libraryCollection ? [libraryCollection] : [];
    }

    const topLevelCollections = (data?.data ?? []).filter(
      (c) => !c.personal_owner_id && c.type !== "instance-analytics",
    );

    // Add library collection at the beginning if it exists
    if (libraryCollection) {
      return [libraryCollection, ...topLevelCollections];
    }

    return topLevelCollections;
  }, [data, libraryCollection, skipCollections]);

  return (
    <CollectionSyncList
      collections={collections}
      emptyMessage={t`No collections found`}
      error={error ? t`Failed to load collections` : null}
      isLoading={isLoading || isLoadingLibrary}
      showTransformsRow={PLUGIN_TRANSFORMS.isEnabled}
      showLibraryPlaceholder={skipCollections && !libraryCollection}
      onLibraryPendingChange={onLibraryPendingChange}
      isLibraryPendingChecked={isLibraryPendingChecked}
    />
  );
};
