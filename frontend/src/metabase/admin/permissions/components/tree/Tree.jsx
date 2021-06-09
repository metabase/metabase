import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { TreeNodeList } from "./TreeNodeList";
import { TreeNode } from "./TreeNode";

const propTypes = {
  TreeNodeComponent: PropTypes.object,
  data: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export function Tree({ TreeNodeComponent = TreeNode, data, onSelect }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);

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

  const handleSelect = useCallback(
    itemId => {
      setSelectedId(itemId);
      onSelect(itemId);
    },
    [onSelect],
  );

  return (
    <div>
      <TreeNodeList
        TreeNodeComponent={TreeNodeComponent}
        items={data}
        onSelect={handleSelect}
        onToggleExpand={handleToggleExpand}
        expandedIds={expandedIds}
        selectedId={selectedId}
        depth={0}
      />
    </div>
  );
}

Tree.propTypes = propTypes;
