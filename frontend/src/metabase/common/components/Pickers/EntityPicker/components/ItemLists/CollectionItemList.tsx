import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionItem } from "metabase-types/api";

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
    id: getCollectionItemsParentId(parentItem),
    namespace:
      "namespace" in parentItem && !!parentItem.namespace
        ? parentItem.namespace
        : undefined,
    ...getCollectionItemsOptions({ models }),
  });

  const items = getCollectionItems({
    parentItem,
    items: collectionItems?.data,
  });

  return (
    <ItemList
      items={items}
      pathIndex={pathIndex}
      isLoading={isLoading}
      error={error}
    />
  );
};

function getCollectionItemsParentId(parentItem: OmniPickerItem) {
  if (parentItem.model === "collection" && parentItem.sourceCollectionId) {
    return parentItem.sourceCollectionId;
  }

  return !parentItem.id ? "root" : parentItem.id;
}

function getCollectionItems({
  parentItem,
  items,
}: {
  parentItem: OmniPickerItem;
  items?: CollectionItem[];
}): OmniPickerItem[] | undefined {
  if (!items || parentItem.model !== "collection") {
    return items;
  }

  if (parentItem.childTypeFilter) {
    return items.filter(
      (item) =>
        item.model !== "collection" || item.type === parentItem.childTypeFilter,
    );
  }

  if (parentItem.type === "library") {
    return (
      PLUGIN_LIBRARY.getCollectionPickerItems({ parentItem, items }) ?? items
    );
  }

  return items;
}
