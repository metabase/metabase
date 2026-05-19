import { c } from "ttag";
import _ from "underscore";

import * as Urls from "metabase/urls";
import type { Collection, CollectionItem } from "metabase-types/api";

// Models that participate in the trash lifecycle (restore + permanent delete).
// A superset of ArchivableItem.model exists in metabase/archive/hooks/use-set-archive.ts —
// items like snippets and timelines can be archived but not surfaced in the trash UI.
export const TRASHABLE_MODELS_ARRAY = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
] as const;

export type TrashableModel = (typeof TRASHABLE_MODELS_ARRAY)[number];

export const TRASHABLE_MODELS = new Set<string>(TRASHABLE_MODELS_ARRAY);

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

function isDashboardQuestion(entity: unknown): entity is {
  type: "question";
  dashboard_id: number | string;
} {
  if (typeof entity !== "object" || entity === null) {
    return false;
  }
  const { type, dashboard_id } = entity as {
    type?: unknown;
    dashboard_id?: unknown;
  };
  return (
    type === "question" &&
    (typeof dashboard_id === "number" || typeof dashboard_id === "string")
  );
}

export function getParentEntityLink(
  updatedEntity: unknown,
  parentCollection: Pick<Collection, "id" | "name"> | undefined,
) {
  // get link for parent collection
  const parentCollectionLink = parentCollection
    ? Urls.collection(parentCollection)
    : `/collection/root`;

  // get link for parent dashboard if we're dealing with a dashboard question
  const parentDashboardLink = isDashboardQuestion(updatedEntity)
    ? Urls.dashboard({ id: updatedEntity.dashboard_id, name: "" })
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
