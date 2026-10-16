import { match } from "ts-pattern";

import * as Urls from "metabase/urls";
import type { Card, Collection } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/card";

import { isLibraryCollectionType } from "../../utils";

import type { ContentItem, ContentOwner } from "./types";

export function filterContentItems(
  items: ContentItem[],
  searchQuery: string,
): ContentItem[] {
  const query = searchQuery.trim().toLowerCase();
  if (query.length === 0) {
    return items;
  }
  return items.filter(
    (item) => isReadableCard(item) && item.name.toLowerCase().includes(query),
  );
}

/**
 * Where a content row opens: Data Studio for a metric saved in the Library,
 * the main app for everything else, including a metric saved outside it.
 */
export function getContentItemUrl(
  item: Card,
  collectionType: Collection["type"],
): string {
  const isLibraryMetric =
    item.type === "metric" && isLibraryCollectionType(collectionType);
  return isLibraryMetric ? Urls.dataStudioMetric(item.id) : Urls.card(item);
}

/**
 * Whether `item` is saved in `owner` itself rather than in a collection. A
 * dashboard question always shares its dashboard's collection, but a document
 * question keeps its `document_id` when it is moved to another collection.
 */
export function isSavedToOwner(item: Card, owner: ContentOwner): boolean {
  return match(owner)
    .with({ model: "dashboard" }, ({ id }) => item.dashboard_id === id)
    .with(
      { model: "document" },
      ({ id, collection_id }) =>
        item.document_id === id && item.collection_id === collection_id,
    )
    .exhaustive();
}
