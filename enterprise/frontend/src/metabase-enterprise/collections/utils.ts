import type { Bookmark, Collection } from "metabase-types/api";
import { REGULAR_COLLECTION } from "./constants";

export function isRegularCollection({
  authority_level,
}: Bookmark | Partial<Collection>) {
  // Root, personal collections don't have `authority_level`
  return !authority_level || authority_level === REGULAR_COLLECTION.type;
}
