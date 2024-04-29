import _ from "underscore";

import type { Collection, CollectionItem } from "metabase-types/api";

/**
 * @param  updateActionResult - result value of await dispatch(Entity.action.update(...))
 */
export function HACK_getParentCollectionFromEntityUpdateAction(
  item: CollectionItem,
  updateActionResult: any,
): Pick<Collection, "id" | "name"> {
  return item.model === "collection"
    ? _.last(updateActionResult?.payload?.collection?.effective_ancestors)
    : updateActionResult?.payload?.object?.collection;
}
