import type { Collection } from "metabase-types/api";
import {
  isInstanceAnalyticsCustomCollection,
  isTrashedCollection,
} from "metabase/common/collections/utils";

export function canCleanUp(collection: Collection): boolean {
  return Boolean(
    !isInstanceAnalyticsCustomCollection(collection) &&
    !isTrashedCollection(collection) &&
    !collection.is_sample &&
    collection.can_write,
  );
}
