import { useCallback, useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

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

  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !hasRemoteSyncedCollections,
    refetchOnFocus: true,
  });

  const changedCollections = useMemo(
    () => dirtyData?.changedCollections ?? {},
    [dirtyData?.changedCollections],
  );

  const showChangesBadge = useCallback(
    (itemId?: number | string) => {
      if (
        !hasRemoteSyncedCollections ||
        !changedCollections ||
        typeof itemId !== "number"
      ) {
        return false;
      }
      return !!changedCollections[itemId];
    },
    [hasRemoteSyncedCollections, changedCollections],
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
