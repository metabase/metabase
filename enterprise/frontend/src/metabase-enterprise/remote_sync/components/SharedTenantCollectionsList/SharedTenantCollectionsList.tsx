import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";

import { CollectionSyncList } from "../CollectionSyncList";

export const SharedTenantCollectionsList = () => {
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
    />
  );
};
