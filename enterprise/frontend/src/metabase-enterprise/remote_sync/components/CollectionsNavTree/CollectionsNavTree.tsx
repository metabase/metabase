import { useCallback, useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
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
  pageSize?: number;
  remainingByLevel?: Map<number | string | null, number>;
  startOffsetByLevel?: Map<number | string | null, number>;
  onJumpTo?: (parentId: number | string | null, rowIndex: number) => void;
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
  pageSize,
  remainingByLevel,
  startOffsetByLevel,
  onJumpTo,
}: CollectionsNavTreeProps) => {
  // Fetch flat list to check for remote-synced collections
  const { data: collectionsList = [] } = useListCollectionsQuery({
    archived: false,
  });

  const hasRemoteSyncedCollections = useMemo(
    () => collectionsList.some((c) => c.is_remote_synced),
    [collectionsList],
  );

  const { isCollectionDirty } = useRemoteSyncDirtyState();

  const showChangesBadge = useCallback(
    (itemId?: number | string) => {
      if (!hasRemoteSyncedCollections) {
        return false;
      }
      return isCollectionDirty(itemId);
    },
    [hasRemoteSyncedCollections, isCollectionDirty],
  );

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
      pageSize={pageSize}
      remainingByLevel={remainingByLevel}
      startOffsetByLevel={startOffsetByLevel}
      onJumpTo={onJumpTo}
      TreeNode={SidebarCollectionLink}
      role="tree"
      aria-label="collection-tree"
      rightSection={(item) =>
        showChangesBadge(item?.id) && <CollectionSyncStatusBadge />
      }
    />
  );
};
