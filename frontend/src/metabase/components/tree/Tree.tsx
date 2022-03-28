import React, { useState, useCallback, useEffect } from "react";
import { TreeNodeList } from "./TreeNodeList";
import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { getInitialExpandedIds } from "./utils";
import { ITreeNodeItem, TreeNodeComponent } from "./types";

interface TreeProps {
  data: ITreeNodeItem[];
  selectedId?: ITreeNodeItem["id"];
  emptyState?: React.ReactNode;
  onSelect?: (item: ITreeNodeItem) => void;
  TreeNode?: TreeNodeComponent;
}

function BaseTree({
  data,
  selectedId,
  emptyState = null,
  onSelect,
  TreeNode = DefaultTreeNode,
}: TreeProps) {
  const [expandedIds, setExpandedIds] = useState(
    new Set(selectedId != null ? getInitialExpandedIds(selectedId, data) : []),
  );

  useEffect(() => {
    if (selectedId && !expandedIds.has(selectedId)) {
      setExpandedIds(
        prev => new Set([...prev, ...getInitialExpandedIds(selectedId, data)]),
      );
    }
  }, [data, selectedId, expandedIds]);

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
    return <React.Fragment>{emptyState}</React.Fragment>;
  }

  return (
    <TreeNodeList
      items={data}
      TreeNode={TreeNode}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
});
