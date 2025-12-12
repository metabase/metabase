import { useListCollectionItemsQuery } from "metabase/api";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";

import { ItemList, type OmniPickerItem } from "../../../EntityPicker";
import { getValidCollectionItemModels } from "../../../EntityPicker/utils";

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
    id: parentItem.id,
    models: getValidCollectionItemModels(models),
    include_can_run_adhoc_query: true,
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
