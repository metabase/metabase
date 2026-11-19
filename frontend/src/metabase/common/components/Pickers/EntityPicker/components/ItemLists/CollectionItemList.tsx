import { useListCollectionItemsQuery } from "metabase/api";
import { getCollectionItemsOptions } from "metabase/common/components/Pickers/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionItem } from "metabase-types/api";

import { useOmniPickerContext } from "../../context";
import {
  SYNCED_CONTENT_ID,
  isRootCollectionItem,
  useSyncedContent,
} from "../../hooks/use-synced-content";
import type { OmniPickerItem } from "../../types";

import { ItemList } from "./ItemList";

export const CollectionItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerItem;
  pathIndex: number;
}) => {
  const { models } = useOmniPickerContext();
  const { isGitIntegrationEnabled, isSyncedCollection } = useSyncedContent();

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
    items: getSyncedTreeItems({
      parentItem,
      items: collectionItems?.data,
      isGitIntegrationEnabled,
      isSyncedCollection,
    }),
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

/**
 * PROTOTYPE: with git integration on, the root's synced collections are listed
 * under "Synced content" and left out of "Explorations".
 */
function getSyncedTreeItems({
  parentItem,
  items,
  isGitIntegrationEnabled,
  isSyncedCollection,
}: {
  parentItem: OmniPickerItem;
  items?: CollectionItem[];
  isGitIntegrationEnabled: boolean;
  isSyncedCollection: (item: CollectionItem) => boolean;
}): CollectionItem[] | undefined {
  if (!items) {
    return items;
  }
  if (parentItem.id === SYNCED_CONTENT_ID) {
    return items.filter(
      (item) =>
        isSyncedCollection(item) &&
        !PLUGIN_LIBRARY.isLibraryCollectionType(item.type),
    );
  }
  if (isGitIntegrationEnabled && isRootCollectionItem(parentItem)) {
    return items.filter((item) => !isSyncedCollection(item));
  }
  return items;
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
