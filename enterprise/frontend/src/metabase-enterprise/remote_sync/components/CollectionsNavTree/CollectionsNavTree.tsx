import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { TreeController } from "metabase/common/components/tree/useTree";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";

import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";
import { CollectionSyncStatusBadge } from "../SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";

interface CollectionsNavTreeProps {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
  tree?: TreeController;
  onNodeHover?: (id: number | string) => void;
  hasMore?: boolean;
  onLoadMore?: (parentId: number | string | null) => void;
  loadingMoreIds?: Set<number | string | null>;
}

export const CollectionsNavTree = ({
  collections,
  selectedId,
  onSelect,
  tree,
  onNodeHover,
  hasMore,
  onLoadMore,
  loadingMoreIds,
}: CollectionsNavTreeProps) => {
  // The dirty state is the whole test. It comes from the remote sync changes endpoint, which is bounded to what has
  // changed and is skipped altogether while git sync is off, so it is already empty when nothing is synced. Reading
  // every collection to ask the same question again cost a full table scan in the sidebar.
  const { isCollectionDirty } = useRemoteSyncDirtyState();

  return (
    <Tree
      data={collections}
      selectedId={selectedId}
      onSelect={onSelect}
      tree={tree}
      onNodeHover={onNodeHover}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMoreIds={loadingMoreIds}
      TreeNode={SidebarCollectionLink}
      role="tree"
      aria-label="collection-tree"
      rightSection={(item) =>
        isCollectionDirty(item?.id) && <CollectionSyncStatusBadge />
      }
    />
  );
};
