import { useCallback, useEffect, useState } from "react";
import * as React from "react";
import { usePrevious } from "react-use";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import { getAllExpandableIds, getInitialExpandedIds } from "./utils";

interface TreeProps {
  data: ITreeNodeItem[];
  selectedId?: ITreeNodeItem["id"];
  role?: string;
  emptyState?: React.ReactNode;
  initiallyExpanded?: boolean;
  onSelect?: (item: ITreeNodeItem) => void;
  rightSection?: (item: ITreeNodeItem) => React.ReactNode;
  TreeNode?: any; // This was previously set to TreeNodeComponent, but after upgrading to react 18, the type no longer played nice with forward ref compontents, including styled components
}

function BaseTree({
  data,
  selectedId,
  role = "menu",
  emptyState = null,
  initiallyExpanded = false,
  onSelect,
  TreeNode = DefaultTreeNode,
  rightSection,
}: TreeProps) {
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
      items={data}
      role={role}
      TreeNode={TreeNode}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
      rightSection={rightSection}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
