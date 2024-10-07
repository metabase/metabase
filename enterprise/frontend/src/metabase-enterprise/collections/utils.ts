import type { IconData, ObjectWithModel } from "metabase/lib/icon";
import { getIconBase } from "metabase/lib/icon";
import type { ItemWithCollection } from "metabase/plugins";
import type {
  Bookmark,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionId,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

import {
  COLLECTION_TYPES,
  INSTANCE_ANALYTICS_COLLECTION,
  OFFICIAL_COLLECTION,
  REGULAR_COLLECTION,
} from "./constants";

export function isRegularCollection({
  authority_level,
  type,
}: Bookmark | Partial<Collection>) {
  // Root, personal collections don't have `authority_level`
  return (
    (!authority_level || authority_level === REGULAR_COLLECTION.type) &&
    type !== "instance-analytics"
  );
}

export function getCollectionType({
  authority_level,
  type,
}: Partial<Collection>):
  | CollectionAuthorityLevelConfig
  | CollectionInstanceAnaltyicsConfig {
  return (
    COLLECTION_TYPES?.[String(type || authority_level)] ?? REGULAR_COLLECTION
  );
}

export function isInstanceAnalyticsCollection(
  collection?: Pick<Collection, "type">,
): boolean {
  return (
    !!collection && getCollectionType(collection).type === "instance-analytics"
  );
}

export const getIcon = (item: ObjectWithModel): IconData => {
  if (getCollectionType({ type: item.type }).type === "instance-analytics") {
    return {
      name: INSTANCE_ANALYTICS_COLLECTION.icon,
    };
  }

  if (
    item.model === "collection" &&
    (item.authority_level === "official" ||
      item.collection_authority_level === "official")
  ) {
    return {
      name: OFFICIAL_COLLECTION.icon,
      color: OFFICIAL_COLLECTION.color,
    };
  }

  if (item.model === "dataset" && item.moderated_status === "verified") {
    return {
      name: "model_with_badge",
    };
  }

  return getIconBase(item);
};

/** Removes items from the array that belong to the instance analytics collection or one of its children */
export const filterOutItemsFromInstanceAnalytics = <
  Item extends ItemWithCollection,
>(
  items: Item[],
) => {
  /** Cache of ids of instance analytics collections */
  const cache = new Set<CollectionId>();

  return items.filter(item => {
    if (cache.has(item.collection.id)) {
      return false;
    }
    const ancestors = item.collection.effective_ancestors || [];
    const path = [item.collection, ...ancestors];
    if (path.some(isInstanceAnalyticsCollection)) {
      path.map(c => c.id).forEach(id => cache.add(id));
      return false;
    }
    return true;
  });
};
