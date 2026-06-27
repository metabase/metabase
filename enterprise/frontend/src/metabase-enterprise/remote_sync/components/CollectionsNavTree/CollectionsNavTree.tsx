import { useCallback, useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { Tree } from "metabase/common/components/tree";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { CollectionsNavTreeProps } from "metabase/plugins";

import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";
import { CollectionSyncStatusBadge } from "../SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";

export const CollectionsNavTree = ({
  collections,
  selectedId,
  onSelect,
  initialExpandedIds,
  pinnedExpandedIds,
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
      initialExpandedIds={initialExpandedIds}
      pinnedExpandedIds={pinnedExpandedIds}
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
