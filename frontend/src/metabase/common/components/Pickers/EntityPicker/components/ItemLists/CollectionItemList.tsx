import { useListCollectionItemsQuery } from "metabase/api";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";
import { getCollectionItemsOptions } from "../../utils";

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
    id: !parentItem.id ? "root" : parentItem.id,
    namespace:
      "namespace" in parentItem && !!parentItem.namespace
        ? parentItem.namespace
        : undefined,
    ...getCollectionItemsOptions({ models }),
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
