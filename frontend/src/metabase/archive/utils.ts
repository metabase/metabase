import { c } from "ttag";
import _ from "underscore";

import type { Collection, CollectionItem } from "metabase-types/api";

/**
 * @param  updateActionResult - result value of await dispatch(Entity.action.update(...))
 */
export function HACK_getParentCollectionFromEntityUpdateAction(
  item: CollectionItem,
  updateActionResult: any,
): Pick<Collection, "id" | "name"> | undefined {
  return item.model === "collection"
    ? _.last(updateActionResult?.payload?.collection?.effective_ancestors)
    : updateActionResult?.payload?.object?.collection;
}

export function getTrashUndoMessage(name: string, archived: boolean): string {
  return archived
    ? c(
        "{0} is the name of the entity being trashed, e.g. My Awesome Dashboard",
      ).t`${name} has been moved to the trash.`
    : c(
        "{0} is the name of the entity being restored from the trash, e.g. My Awesome Dashboard",
      ).t`${name} has been restored.`;
}
