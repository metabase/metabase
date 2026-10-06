import { useListCollectionItemsQuery } from "metabase/api";
import { getCollectionItemsOptions } from "metabase/common/components/Pickers/utils";
import {
  getLibraryDashboardsPickerItem,
  isLibraryDashboardsCollection,
  useCanUseLibraryDashboards,
  useLibraryDashboardsCollection,
} from "metabase/common/data-studio/library-dashboards";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionItem } from "metabase-types/api";

import { useOmniPickerContext } from "../../context";
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

  const isLibraryParent =
    parentItem.model === "collection" && parentItem.type === "library";
  const canUseLibraryDashboards = useCanUseLibraryDashboards();
  const { data: libraryDashboardsCollection } = useLibraryDashboardsCollection({
    skip: !isLibraryParent || !canUseLibraryDashboards,
  });

  const items = withLibraryDashboards({
    parentItem,
    items: getCollectionItems({
      parentItem,
      items: collectionItems?.data,
    }),
    libraryDashboardsCollection: canUseLibraryDashboards
      ? libraryDashboardsCollection
      : undefined,
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

// PROTOTYPE: present the Library › Dashboards collection inside the Library
// instead of the root collection
function withLibraryDashboards({
  parentItem,
  items,
  libraryDashboardsCollection,
}: {
  parentItem: OmniPickerItem;
  items?: OmniPickerItem[];
  libraryDashboardsCollection?: CollectionItem;
}): OmniPickerItem[] | undefined {
  if (!items || parentItem.model !== "collection") {
    return items;
  }

  const isRootParent =
    (parentItem.id === "root" || parentItem.id === null) &&
    !parentItem.namespace;
  if (isRootParent) {
    return items.filter(
      (item) =>
        !(item.model === "collection" && isLibraryDashboardsCollection(item)),
    );
  }

  if (parentItem.type === "library" && libraryDashboardsCollection) {
    return [
      getLibraryDashboardsPickerItem(libraryDashboardsCollection),
      ...items,
    ];
  }

  return items;
}

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
