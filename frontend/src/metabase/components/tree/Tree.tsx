import React, { useState, useCallback } from "react";
import { TreeNodeList } from "./TreeNodeList";
import { TreeNode } from "./TreeNode";
import { getInitialExpandedIds } from "./utils";
import { TreeItem, TreeNodeId, TreeColorScheme } from "./types";

interface TreeProps {
  TreeNodeComponent: (props: any) => React.ReactElement | null;
  data: TreeItem[];
  onSelect: (item: TreeItem) => void;
  colorScheme: TreeColorScheme;
  selectedId: TreeNodeId;
  emptyState: React.ReactNode;
}

export function Tree({
  TreeNodeComponent = TreeNode,
  data,
  onSelect,
  selectedId,
  colorScheme = "default",
  emptyState = null,
}: TreeProps) {
  const [expandedIds, setExpandedIds] = useState(
    new Set(selectedId != null ? getInitialExpandedIds(selectedId, data) : []),
  );

  const handleToggleExpand = useCallback(
    itemId => {
      if (expandedIds.has(itemId)) {
        setExpandedIds(prev => new Set([...prev].filter(id => id !== itemId)));
      } else {
        setExpandedIds(prev => new Set([...prev, itemId]));
      }
    },
    [expandedIds],
  );

  if (data.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <TreeNodeList
      colorScheme={colorScheme}
      TreeNodeComponent={TreeNodeComponent}
      items={data}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
    />
  );
}
