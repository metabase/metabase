import { msgid, ngettext } from "ttag";

import type { TreeItem } from "metabase/data-studio/common/types";
import type { Collection, CollectionType } from "metabase-types/api";

import { getAccessibleCollection } from "../../utils";

export function getArchiveLibraryCollectionsMessage(count: number): string {
  return ngettext(
    msgid`Archiving this collection will also unpublish the tables inside it (and any tables that depend on them) and archive any other child items.`,
    `Archiving these collections will also unpublish the tables inside them (and any tables that depend on them) and archive any other child items.`,
    count,
  );
}

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = getAccessibleCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}

/**
 * Lists a single section's contents at the top level, without the section's
 * root row and its empty-state row.
 */
export function unwrapSectionRoot(tree: TreeItem[]): TreeItem[] {
  return tree
    .flatMap((node) => node.children ?? [])
    .filter((node) => node.model !== "empty-state");
}

/**
 * Keeps tables whose name matches the query with all their children, and
 * otherwise only the matching children.
 */
export function filterTableGroupedTree(
  tree: TreeItem[],
  searchQuery: string,
): TreeItem[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return tree;
  }

  return tree.flatMap((tableNode) => {
    if (tableNode.name.toLowerCase().includes(query)) {
      return [tableNode];
    }
    const matchingChildren = (tableNode.children ?? []).filter((child) =>
      child.name.toLowerCase().includes(query),
    );
    return matchingChildren.length > 0
      ? [{ ...tableNode, children: matchingChildren }]
      : [];
  });
}
