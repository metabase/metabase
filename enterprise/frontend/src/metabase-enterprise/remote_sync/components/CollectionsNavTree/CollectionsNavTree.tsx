import { Tree } from "metabase/common/components/tree";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { CollectionsNavTreeProps } from "metabase/plugins";

import { useRemoteSyncDirtyState } from "../../hooks";
import { CollectionSyncStatusBadge } from "../CollectionSyncStatusBadge";

export const CollectionsNavTree = ({
  collections,
  selectedId,
  onSelect,
}: CollectionsNavTreeProps) => {
  const { isCollectionDirty } = useRemoteSyncDirtyState();

  return (
    <Tree
      data={collections}
      selectedId={selectedId}
      onSelect={onSelect}
      TreeNode={SidebarCollectionLink}
      role="tree"
      aria-label="collection-tree"
      rightSection={(item) =>
        typeof item?.id === "number" &&
        isCollectionDirty(item.id) && <CollectionSyncStatusBadge />
      }
    />
  );
};
