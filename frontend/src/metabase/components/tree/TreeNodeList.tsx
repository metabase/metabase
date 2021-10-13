import React from "react";
import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";
import { TreeColorScheme, TreeItem, TreeNodeId } from "./types";

interface TreeNodeListProps {
  TreeNodeComponent: (props: any) => React.ReactElement | null;
  items: TreeItem[];
  onSelect: (item: TreeItem) => void;
  colorScheme: TreeColorScheme;
  selectedId: TreeNodeId;
  onToggleExpand: (id: TreeNodeId) => void;
  expandedIds: any;
  depth: number;
}

export function TreeNodeList({
  TreeNodeComponent,
  items,
  onToggleExpand,
  onSelect,
  expandedIds,
  selectedId,
  depth,
  colorScheme,
}: TreeNodeListProps) {
  const selectedRef = useScrollOnMount();

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
              ref={isSelected ? selectedRef : null}
              colorScheme={colorScheme}
              item={item}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              isSelected={isSelected}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              depth={depth}
            />
            {item.children && isExpanded && (
              <TreeNodeList
                colorScheme={colorScheme}
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
