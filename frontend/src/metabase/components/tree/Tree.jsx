import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { TreeNodeList } from "./TreeNodeList";
import { TreeNode } from "./TreeNode";
import { getInitialExpandedIds } from "./utils";

const propTypes = {
  TreeNodeComponent: PropTypes.object,
  data: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  colorScheme: PropTypes.oneOf(["default", "admin"]),
  selectedId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  emptyState: PropTypes.node,
};

export function Tree({
  TreeNodeComponent = TreeNode,
  data,
  onSelect,
  selectedId,
  colorScheme = "default",
  emptyState = null,
}) {
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

Tree.propTypes = propTypes;
