import React from "react";
import PropTypes from "prop-types";

const propTypes = {
  TreeNodeComponent: PropTypes.object.isRequired,
  items: PropTypes.array.isRequired,
  onToggleExpand: PropTypes.func,
  onSelect: PropTypes.func.isRequired,
  expandedIds: PropTypes.instanceOf(Set),
  selectedId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  depth: PropTypes.number.isRequired,
};

export function TreeNodeList({
  TreeNodeComponent,
  items,
  onToggleExpand,
  onSelect,
  expandedIds,
  selectedId,
  depth,
}) {
  return (
    <ul role="menu">
      {items.map(item => {
        const isSelected = selectedId === item.id;
        const hasChildren =
          Array.isArray(item.children) && item.children.length > 0;
        const isExpanded = hasChildren && expandedIds.has(item.id);

        return (
          <React.Fragment key={item.id}>
            <TreeNodeComponent
              item={item}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              isSelected={isSelected}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              depth={depth}
            />
            {isExpanded && (
              <TreeNodeList
                TreeNodeComponent={TreeNodeComponent}
                items={item.children}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                expandedIds={expandedIds}
                selectedId={selectedId}
                depth={depth + 1}
              />
            )}
          </React.Fragment>
        );
      })}
    </ul>
  );
}

TreeNodeList.propTypes = propTypes;
