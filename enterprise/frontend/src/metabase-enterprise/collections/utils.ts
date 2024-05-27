import type { IconData, ObjectWithModel } from "metabase/lib/icon";
import { getIconBase } from "metabase/lib/icon";
import type {
  Bookmark,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

import {
  REGULAR_COLLECTION,
  COLLECTION_TYPES,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID,
  INSTANCE_ANALYTICS_COLLECTION,
  OFFICIAL_COLLECTION,
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

export const getInstanceAnalyticsCustomCollection = (
  collections: Collection[],
) =>
  collections?.find?.(
    collection =>
      collection.entity_id === CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID,
  ) ?? null;

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
      color: OFFICIAL_COLLECTION.color,
    };
  }

  return getIconBase(item);
};
