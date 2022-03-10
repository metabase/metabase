import React, { useState, useCallback } from "react";
import { TreeNodeList } from "./TreeNodeList";
import { getInitialExpandedIds } from "./utils";
import { ColorScheme, ITreeNodeItem } from "./types";

interface TreeProps {
  data: ITreeNodeItem[];
  onSelect: (item: ITreeNodeItem) => void;
  selectedId?: ITreeNodeItem["id"];
  colorScheme?: ColorScheme;
  emptyState?: React.ReactNode;
}

export function Tree({
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
    return <React.Fragment>{emptyState}</React.Fragment>;
  }

  return (
    <TreeNodeList
      colorScheme={colorScheme}
      items={data}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
    />
  );
}
