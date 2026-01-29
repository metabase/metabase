import { useListCollectionItemsQuery } from "metabase/api";
import { ItemList } from "metabase/common/components/Pickers/EntityPicker/components";

export const TenantCollectionItemList = ({
  pathIndex,
}: {
  pathIndex: number;
}) => {
  const {
    data: collectionItems,
    error,
    isLoading,
  } = useListCollectionItemsQuery({
    id: "root",
    namespace: "shared-tenant-collection",
  });

  return (
    <ItemList
      items={collectionItems?.data}
      isLoading={isLoading}
      error={error}
      pathIndex={pathIndex}
    />
  );
};
