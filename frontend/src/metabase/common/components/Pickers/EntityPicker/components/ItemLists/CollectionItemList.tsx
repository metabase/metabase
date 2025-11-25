import { useListCollectionItemsQuery } from "metabase/api";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";
import { getValidCollectionItemModels } from "../../utils";

import { ItemList } from "./ItemList";

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
    // this request needs to sync with use-get-path-from-value.ts to make sure we get cache hits
    id: !parentItem.id ? "root" : parentItem.id,
    models: getValidCollectionItemModels(models),
    include_can_run_adhoc_query: models.includes("table"),
    namespace:
      "namespace" in parentItem && !!parentItem.namespace
        ? parentItem.namespace
        : undefined,
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
