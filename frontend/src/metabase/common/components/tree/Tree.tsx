import { useCallback, useEffect, useState } from "react";
import * as React from "react";
import { usePrevious } from "react-use";

import type { BoxProps } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import { getAllExpandableIds, getInitialExpandedIds } from "./utils";

interface TreeProps<TData = unknown> extends Omit<BoxProps, "children"> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  emptyState?: React.ReactNode;
  initiallyExpanded?: boolean;
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
  initiallyExpanded = false,
  onSelect,
  TreeNode = DefaultTreeNode,
  rightSection,
  ...boxProps
}: TreeProps<TData>) {
  const [expandedIds, setExpandedIds] = useState(() => {
    if (initiallyExpanded) {
      return new Set(getAllExpandableIds(data));
    }
    return new Set(
      selectedId != null ? getInitialExpandedIds(selectedId, data) : [],
    );
  });
  const previousSelectedId = usePrevious(selectedId);
  const prevData = usePrevious(data);

  useEffect(() => {
    if (initiallyExpanded && data !== prevData) {
      setExpandedIds(new Set(getAllExpandableIds(data)));
      return;
    }

    if (!selectedId) {
      return;
    }
    const selectedItemChanged =
      previousSelectedId !== selectedId && !expandedIds.has(selectedId);
    if (selectedItemChanged || data !== prevData) {
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
    initiallyExpanded,
  ]);

  const handleToggleExpand = useCallback(
    (itemId: string | number) => {
      if (expandedIds.has(itemId)) {
        setExpandedIds(
          (prev) => new Set([...prev].filter((id) => id !== itemId)),
        );
      } else {
        setExpandedIds((prev) => new Set([...prev, itemId]));
      }
    },
    [expandedIds],
  );

  if (data.length === 0) {
    return <React.Fragment>{emptyState}</React.Fragment>;
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
      {...boxProps}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
