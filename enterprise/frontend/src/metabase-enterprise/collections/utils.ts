import type { Bookmark, Collection } from "metabase-types/api";
import { REGULAR_COLLECTION, COLLECTION_TYPES } from "./constants";

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
}: Partial<Collection>) {
  return COLLECTION_TYPES[String(type || authority_level)];
}
