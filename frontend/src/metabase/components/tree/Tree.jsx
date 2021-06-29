import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { TreeNodeList } from "./TreeNodeList";
import { TreeNode } from "./TreeNode";

const propTypes = {
  TreeNodeComponent: PropTypes.object,
  data: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(["default", "admin"]),
  selectedId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

const defaultProps = {
  variant: "default",
};

export function Tree({
  TreeNodeComponent = TreeNode,
  data,
  onSelect,
  selectedId,
  variant,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());

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

  return (
    <TreeNodeList
      variant={variant}
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

Tree.defaultProps = defaultProps;

Tree.propTypes = propTypes;
