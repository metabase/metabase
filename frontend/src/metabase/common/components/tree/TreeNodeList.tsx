import { Fragment } from "react";

import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";
import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

import { TreeNodeSkeleton } from "./TreeNodeSkeleton";
import type { ITreeNodeItem, TreeNodeComponent } from "./types";

interface TreeNodeListProps<TData = unknown> extends Omit<
  BoxProps,
  "children"
> {
  items: ITreeNodeItem<TData>[];
  expandedIds: Set<ITreeNodeItem<TData>["id"]>;
  selectedId?: ITreeNodeItem<TData>["id"];
  depth: number;
  role?: string;
  onToggleExpand: (id: ITreeNodeItem<TData>["id"]) => void;
  onNodeHover?: (id: ITreeNodeItem<TData>["id"]) => void;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  TreeNode: TreeNodeComponent<TData>;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
}

function BaseTreeNodeList<TData = unknown>({
  items,
  expandedIds,
  selectedId,
  depth,
  onSelect,
  onToggleExpand,
  onNodeHover,
  TreeNode,
  rightSection,
  role,
  ...boxProps
}: TreeNodeListProps<TData>) {
  const selectedRef = useScrollOnMount<HTMLLIElement>();

  return (
    <Box component="ul" role={role} {...boxProps}>
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const hasChildren =
          item.hasChildren ??
          (Array.isArray(item.children) && item.children.length > 0);
        const isExpanded = hasChildren && expandedIds.has(item.id);
        const areChildrenLoaded = item.childrenLoaded ?? true;
        const onItemSelect =
          typeof onSelect === "function" ? () => onSelect(item) : undefined;
        const onItemToggle = () => onToggleExpand(item.id);
        const onItemHover = onNodeHover
          ? () => onNodeHover(item.id)
          : undefined;

        return (
          <Fragment key={item.id}>
            <TreeNode
              ref={isSelected ? selectedRef : null}
              item={item}
              onSelect={onItemSelect}
              onToggleExpand={onItemToggle}
              onHover={onItemHover}
              isSelected={isSelected}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              depth={depth}
              rightSection={rightSection}
            />
            {isExpanded &&
              (areChildrenLoaded ? (
                <BaseTreeNodeList
                  items={item.children ?? []}
                  expandedIds={expandedIds}
                  selectedId={selectedId}
                  depth={depth + 1}
                  onSelect={onSelect}
                  onToggleExpand={onToggleExpand}
                  onNodeHover={onNodeHover}
                  TreeNode={TreeNode}
                  rightSection={rightSection}
                />
              ) : (
                <TreeNodeSkeleton depth={depth + 1} />
              ))}
          </Fragment>
        );
      })}
    </Box>
  );
}

export const TreeNodeList = BaseTreeNodeList;
