import { merge } from "icepick";
import { t } from "ttag";
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
    ? t`${name} has been moved to the trash.`
    : t`${name} has been restored.`;
}

export function undoSetArchived(
  name: string,
  archived: boolean,
  opts: Record<string, unknown>,
) {
  const message = getTrashUndoMessage(name, archived);
  return merge({ notify: { message, undo: true } }, opts || {});
}
