import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";

export interface DefaultCollectionsNavTreeProps {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
}

export const DefaultCollectionsNavTree = ({
  collections,
  selectedId,
  onSelect,
}: DefaultCollectionsNavTreeProps) => (
  <Tree
    data={collections}
    selectedId={selectedId}
    onSelect={onSelect}
    TreeNode={SidebarCollectionLink}
    role="tree"
    aria-label="collection-tree"
  />
);
