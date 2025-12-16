import { useListCollectionItemsQuery } from "metabase/api";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";

import { ItemList, type OmniPickerItem } from "../..";
import { getValidCollectionItemModels } from "../../utils";

export const CollectionItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerItem;
  pathIndex: number;
}) => {
  const { models } = useOmniPickerContext();

  const {
    data: collectionItems,
    error,
    isLoading,
  } = useListCollectionItemsQuery({
    id: !parentItem.id ? "root" : parentItem.id,
    models: getValidCollectionItemModels(models),
    include_can_run_adhoc_query: true,
    namespace: "namespace" in parentItem ? parentItem.namespace : undefined,
  });

  return (
    <ItemList
      items={collectionItems?.data}
      pathIndex={pathIndex}
      isLoading={isLoading}
      error={error}
    />
  );
};
