import { Fragment } from "react";

import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

import { ListRoot } from "./TreeNodeList.styled";
import type { ITreeNodeItem, TreeNodeComponent } from "./types";

interface TreeNodeListProps {
  items: ITreeNodeItem[];
  expandedIds: Set<ITreeNodeItem["id"]>;
  selectedId?: ITreeNodeItem["id"];
  depth: number;
  role?: string;
  className?: string;
  onToggleExpand: (id: ITreeNodeItem["id"]) => void;
  onSelect?: (item: ITreeNodeItem) => void;
  TreeNode: TreeNodeComponent;
}

function BaseTreeNodeList({
  items,
  role,
  className,
  expandedIds,
  selectedId,
  depth,
  onSelect,
  onToggleExpand,
  TreeNode,
}: TreeNodeListProps) {
  const selectedRef = useScrollOnMount();

  return (
    <ListRoot className={className} role={role}>
      {items.map(item => {
        const isSelected = selectedId === item.id;
        const hasChildren =
          Array.isArray(item.children) && item.children.length > 0;
        const isExpanded = hasChildren && expandedIds.has(item.id);
        const onItemSelect =
          typeof onSelect === "function" ? () => onSelect(item) : undefined;
        const onItemToggle = () => onToggleExpand(item.id);

        return (
          <Fragment key={item.id}>
            <TreeNode
              ref={isSelected ? selectedRef : null}
              item={item}
              onSelect={onItemSelect}
              onToggleExpand={onItemToggle}
              isSelected={isSelected}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              depth={depth}
            />
            {isExpanded && (
              <BaseTreeNodeList
                items={item.children!}
                expandedIds={expandedIds}
                selectedId={selectedId}
                depth={depth + 1}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                TreeNode={TreeNode}
              />
            )}
          </Fragment>
        );
      })}
    </ListRoot>
  );
}

export const TreeNodeList = Object.assign(BaseTreeNodeList, {
  Root: ListRoot,
});
