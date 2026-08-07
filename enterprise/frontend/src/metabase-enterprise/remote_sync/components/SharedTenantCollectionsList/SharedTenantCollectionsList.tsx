import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";

import { CollectionSyncList } from "../CollectionSyncList";

interface SharedTenantCollectionsListProps {
  /** Ids of collections the last save was refused for, flagged in the list. */
  blockedCollectionIds?: Set<number>;
  /** Ids of collections that must also be switched on for that save to succeed. */
  requiredCollectionIds?: Set<number>;
}

export const SharedTenantCollectionsList = ({
  blockedCollectionIds,
  requiredCollectionIds,
}: SharedTenantCollectionsListProps = {}) => {
  const { data, isLoading, error } = useListCollectionItemsQuery({
    id: "root",
    namespace: "shared-tenant-collection",
  });

  return (
    <CollectionSyncList
      collections={data?.data ?? []}
      isLoading={isLoading}
      error={error ? t`Failed to load shared tenant collections` : null}
      emptyMessage={t`No shared tenant collections found`}
      blockedCollectionIds={blockedCollectionIds}
      requiredCollectionIds={requiredCollectionIds}
    />
  );
};
