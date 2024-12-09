import {
  isInstanceAnalyticsCustomCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import type { Collection } from "metabase-types/api";

export function canCleanUp(collection: Collection): boolean {
  return Boolean(
    !isInstanceAnalyticsCustomCollection(collection) &&
      !isTrashedCollection(collection) &&
      !collection.is_sample &&
      collection.can_write,
  );
}
