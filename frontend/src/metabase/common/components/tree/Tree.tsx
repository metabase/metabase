import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { BoxProps } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import { getInitialExpandedIds } from "./utils";

interface TreeProps<TData = unknown> extends Omit<BoxProps, "children"> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  emptyState?: React.ReactNode;
  initialExpandedIds?: ITreeNodeItem<TData>["id"][];
  /**
   * Pass this with `onToggleExpand` to drive expansion from outside. A lazily loaded tree needs that, because it has
   * to fetch a node's children when the node expands.
   */
  expandedIds?: Set<ITreeNodeItem<TData>["id"]>;
  onToggleExpand?: (id: ITreeNodeItem<TData>["id"]) => void;
  /** Called when the pointer settles on a node, so a lazy tree can fetch its children ahead of the click. */
  onNodeHover?: (id: ITreeNodeItem<TData>["id"]) => void;
  /** Whether the top level itself was cut short, so a "Show more" row belongs at its end. */
  hasMore?: boolean;
  /** Called with the parent whose level should grow, or `null` for the top level. */
  onShowMore?: (parentId: ITreeNodeItem<TData>["id"] | null) => void;
  loadingMoreIds?: Set<ITreeNodeItem<TData>["id"] | null>;
  role?: string;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  TreeNode?: any;
}

function BaseTree<TData = unknown>({
  data,
  selectedId,
  role = "menu",
  emptyState = null,
  initialExpandedIds,
  expandedIds: controlledExpandedIds,
  onToggleExpand: controlledOnToggleExpand,
  onNodeHover,
  hasMore,
  onShowMore,
  loadingMoreIds,
  onSelect,
  TreeNode = DefaultTreeNode,
  rightSection,
  ...boxProps
}: TreeProps<TData>) {
  const isControlled = controlledExpandedIds != null;
  const [ownExpandedIds, setExpandedIds] = useState(() => {
    if (initialExpandedIds) {
      return new Set(initialExpandedIds);
    }
    return new Set(
      selectedId != null ? getInitialExpandedIds(selectedId, data) : [],
    );
  });
  const expandedIds = controlledExpandedIds ?? ownExpandedIds;
  const previousSelectedId = usePrevious(selectedId);
  const prevData = usePrevious(data);

  useEffect(() => {
    if (!selectedId || isControlled) {
      return;
    }
    const dataHasChanged = !_.isEqual(data, prevData);
    const selectedItemChanged =
      previousSelectedId !== selectedId && !expandedIds.has(selectedId);

    if (selectedItemChanged || dataHasChanged) {
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(selectedId, data)]),
      );
    }
  }, [
    prevData,
    data,
    selectedId,
    previousSelectedId,
    expandedIds,
    isControlled,
  ]);

  const handleToggleExpand = useCallback(
    (itemId: string | number) => {
      if (controlledOnToggleExpand) {
        controlledOnToggleExpand(itemId);
        return;
      }
      if (expandedIds.has(itemId)) {
        setExpandedIds(
          (prev) => new Set([...prev].filter((id) => id !== itemId)),
        );
      } else {
        setExpandedIds((prev) => new Set([...prev, itemId]));
      }
    },
    [expandedIds, controlledOnToggleExpand],
  );

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
      onShowMore={onShowMore}
      loadingMoreIds={loadingMoreIds}
      rightSection={rightSection}
      {...boxProps}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
