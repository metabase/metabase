import { c } from "ttag";
import _ from "underscore";

import * as Urls from "metabase/urls";
import type { Collection, CollectionItem } from "metabase-types/api";

// Models that participate in the trash lifecycle (restore + permanent delete).
// A superset of ArchivableItem.model exists in metabase/common/hooks/use-set-archive.ts —
// items like snippets and timelines can be archived but not surfaced in the trash UI.
export const TRASHABLE_MODELS = new Set<string>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
]);

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

export function getParentEntityLink(
  updatedEntity: any,
  parentCollection: Pick<Collection, "id" | "name"> | undefined,
) {
  // get link for parent collection
  const parentCollectionLink = parentCollection
    ? Urls.collection(parentCollection)
    : `/collection/root`;

  // get link for parent dashboard if we're dealing with a dashboard question
  const parentDashboardId =
    updatedEntity.type === "question" ? updatedEntity.dashboard_id : undefined;
  const parentDashboardLink = parentDashboardId
    ? Urls.dashboard({ id: parentDashboardId, name: "" })
    : undefined;

  return parentDashboardLink ? parentDashboardLink : parentCollectionLink;
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
