import React from "react";
import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";
import { ColorScheme, ITreeNodeItem } from "./types";
import { TreeNode } from "./TreeNode";

interface TreeNodeListProps {
  items: ITreeNodeItem[];
  expandedIds: Set<ITreeNodeItem["id"]>;
  selectedId?: ITreeNodeItem["id"];
  depth: number;
  colorScheme: ColorScheme;
  onToggleExpand: (id: ITreeNodeItem["id"]) => void;
}

export function TreeNodeList({
  items,
  onToggleExpand,
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
            <TreeNode
              ref={isSelected ? selectedRef : null}
              colorScheme={colorScheme}
              item={item}
              onToggleExpand={onToggleExpand}
              isSelected={isSelected}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              depth={depth}
            />
            {isExpanded && (
              <TreeNodeList
                colorScheme={colorScheme}
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                items={item.children!}
                onToggleExpand={onToggleExpand}
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
