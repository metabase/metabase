import type { BoxProps } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import type { TreeController } from "./useTree";
import { useTree } from "./useTree";

export interface TreeProps<TData = unknown> extends Omit<BoxProps, "children"> {
  data?: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  emptyState?: React.ReactNode;
  initialExpandedIds?: ITreeNodeItem<TData>["id"][];
  role?: string;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  TreeNode?: any;
  /** Drives expansion from outside. A lazily loaded tree needs it, to fetch a node's children as it expands. */
  tree?: TreeController<TData>;
  wrapNodesInListItem?: boolean;
  /** Called when the pointer settles on a node, so a lazy tree can fetch its children ahead of the click. */
  onNodeHover?: (id: ITreeNodeItem<TData>["id"]) => void;
  /** Whether the top level itself was cut short, so its end should load the next page when reached. */
  hasMore?: boolean;
  /** Called with the parent whose level should grow, or `null` for the top level. */
  onLoadMore?: (parentId: ITreeNodeItem<TData>["id"] | null) => void;
  loadingMoreIds?: Set<ITreeNodeItem<TData>["id"] | null>;
}

function BaseTree<TData = unknown>({
  data: dataProp,
  selectedId: selectedIdProp,
  role = "menu",
  emptyState = null,
  initialExpandedIds,
  onSelect,
  TreeNode = DefaultTreeNode,
  rightSection,
  tree,
  wrapNodesInListItem,
  onNodeHover,
  hasMore,
  onLoadMore,
  loadingMoreIds,
  ...boxProps
}: TreeProps<TData>) {
  const defaultController = useTree({
    data: dataProp,
    selectedId: selectedIdProp,
    initialExpandedIds,
  });
  const controller = tree ?? defaultController;
  const data = controller.data ?? dataProp;
  const selectedId = controller.selectedId ?? selectedIdProp;
  const { expandedIds, handleToggleExpand } = controller;

  if (data.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <TreeNodeList
      role={role}
      items={data}
      TreeNode={TreeNode}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
      onNodeHover={onNodeHover}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMoreIds={loadingMoreIds}
      rightSection={rightSection}
      wrapNodes={wrapNodesInListItem}
      {...boxProps}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
