import { useCallback } from "react";
import { t } from "ttag";

import {
  OFFICIAL_ICON_COLOR,
  OFFICIAL_ICON_NAME,
} from "metabase/common/collections/constants";
import type { CollectionInstanceAnaltyicsConfig } from "metabase/common/collections/types";
import type { IconData, ObjectWithModel } from "metabase/common/utils/icon";
import { useGetIconBase } from "metabase/hooks/use-icon";
import { type ItemWithCollection, PLUGIN_LIBRARY } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  CollectionType,
} from "metabase-types/api";

import {
  COLLECTION_TYPES,
  INSTANCE_ANALYTICS_COLLECTION,
  REGULAR_COLLECTION,
} from "./constants";

export function getCollectionType({
  type,
}: Partial<Collection>): CollectionInstanceAnaltyicsConfig {
  return COLLECTION_TYPES?.[String(type)] ?? REGULAR_COLLECTION;
}

export function isInstanceAnalyticsCollection(
  collection?: Pick<Collection, "type"> | null,
): boolean {
  return (
    !!collection && getCollectionType(collection).type === "instance-analytics"
  );
}

export const useGetIcon = () => {
  const getIconBase = useGetIconBase();

  return useCallback(
    (item: ObjectWithModel): IconData => {
      const collectionType = getCollectionType({
        // Unjustified type cast. FIXME
        type: (item.type as CollectionType) || item.collection_type,
      }).type;
      if (collectionType === "instance-analytics") {
        return {
          name: INSTANCE_ANALYTICS_COLLECTION.icon,
        };
      }

      if (item.model === "collection") {
        // Library collections keep their special icon regardless of sync status
        if (PLUGIN_LIBRARY.isLibraryCollectionType(item.type)) {
          return getIconBase(item);
        }

        if (item.is_remote_synced) {
          return {
            name: OFFICIAL_ICON_NAME,
            color: OFFICIAL_ICON_COLOR,
            tooltip: t`Official collection`,
          };
        }
      }

      return getIconBase(item);
    },
    [getIconBase],
  );
};

/** Removes items from the array that belong to the instance analytics collection or one of its children */
export const filterOutItemsFromInstanceAnalytics = <
  Item extends ItemWithCollection,
>(
  items: Item[],
) => {
  /** Cache of ids of instance analytics collections */
  const cache = new Set<CollectionId>();

  return items.filter((item) => {
    if (cache.has(item.collection.id)) {
      return false;
    }
    const ancestors = item.collection.effective_ancestors || [];
    const path = [item.collection, ...ancestors];
    if (path.some(isInstanceAnalyticsCollection)) {
      path.map((c) => c.id).forEach((id) => cache.add(id));
      return false;
    }
    return true;
  });
};
