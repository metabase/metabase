import { msgid, ngettext } from "ttag";

import type { Collection, CollectionType } from "metabase-types/api";

export function getArchiveLibraryCollectionsMessage(count: number): string {
  return ngettext(
    msgid`Archiving this collection will also unpublish the tables inside it (and any tables that depend on them) and archive any other child items.`,
    `Archiving these collections will also unpublish the tables inside them (and any tables that depend on them) and archive any other child items.`,
    count,
  );
}

export function getAccessibleCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  return rootCollection.children?.find(
    (collection) => collection.type === type,
  );
}

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = getAccessibleCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}
