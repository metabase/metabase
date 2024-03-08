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
