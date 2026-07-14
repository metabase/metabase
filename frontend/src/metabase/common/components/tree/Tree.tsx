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
  tree?: TreeController<TData>;
  wrapNodes?: boolean;
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
  wrapNodes,
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
      rightSection={rightSection}
      wrapNodes={wrapNodes}
      {...boxProps}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
