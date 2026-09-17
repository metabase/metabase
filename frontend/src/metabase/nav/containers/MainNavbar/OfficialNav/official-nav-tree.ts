import type { CollectionTreeItem } from "metabase/common/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionId } from "metabase-types/api";

import type { OfficialNavNodeData } from "./OfficialNavTreeNode";
import type { OfficialNavItem } from "./use-official-nav-items";

export type OfficialNavTreeNodeItem = ITreeNodeItem<OfficialNavNodeData>;

/**
 * Hangs item rows off every collection node, after that collection's child collections, so one
 * `Tree` can render collections and their contents together.
 */
export function buildOfficialNavTree(
  collections: CollectionTreeItem[],
  itemsByCollectionId: Map<CollectionId, OfficialNavItem[]>,
): OfficialNavTreeNodeItem[] {
  return collections.map((collection) => {
    const items = itemsByCollectionId.get(collection.id) ?? [];

    // Spread keeps every `Collection` field, which `SidebarCollectionLink` reads off the node.
    return {
      ...collection,
      children: [
        ...buildOfficialNavTree(collection.children ?? [], itemsByCollectionId),
        ...items.map(
          (navItem): OfficialNavTreeNodeItem => ({
            id: `${navItem.model}-${navItem.id}`,
            name: navItem.name,
            icon: navItem.icon,
            children: [],
            data: { navItem },
          }),
        ),
      ],
    } as OfficialNavTreeNodeItem;
  });
}
