import { useCallback, useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";

import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";
import { CollectionSyncStatusBadge } from "../SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";

interface CollectionsNavTreeProps {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
}

export const CollectionsNavTree = ({
  collections,
  selectedId,
  onSelect,
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
      TreeNode={SidebarCollectionLink}
      role="tree"
      aria-label="collection-tree"
      rightSection={(item) =>
        showChangesBadge(item?.id) && <CollectionSyncStatusBadge />
      }
    />
  );
};
