import { Fragment } from "react";

import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";
import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

import { ROW_HEIGHT, TreeLoadMore } from "./TreeLoadMore";
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
  /** Whether this list itself was cut short, so its end should load the next page when reached. */
  hasMore?: boolean;
  /** The parent whose level this is, or `null` for the top level. Passed back by `onLoadMore`. */
  loadMoreFor?: ITreeNodeItem<TData>["id"] | null;
  onLoadMore?: (parentId: ITreeNodeItem<TData>["id"] | null) => void;
  loadingMoreIds?: Set<ITreeNodeItem<TData>["id"] | null>;
  /** How many rows a page brings, so a level loading its next one reserves their height. */
  pageSize?: number;
  /** Per level, how many rows it holds beyond the ones rendered. Keyed by parent id, or `null` for the top level. */
  remainingByLevel?: Map<ITreeNodeItem<TData>["id"] | null, number>;
  /** Per level, how many of its rows sit above the ones rendered. Keyed the same way. */
  startOffsetByLevel?: Map<ITreeNodeItem<TData>["id"] | null, number>;
  /** Reads the page covering a row of a level, wherever in it the reader has scrolled to. */
  onJumpTo?: (
    parentId: ITreeNodeItem<TData>["id"] | null,
    rowIndex: number,
  ) => void;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  TreeNode: TreeNodeComponent<TData>;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  wrapNodes?: boolean;
}

function BaseTreeNodeList<TData = unknown>({
  items,
  expandedIds,
  selectedId,
  depth,
  onSelect,
  onToggleExpand,
  onNodeHover,
  hasMore,
  loadMoreFor = null,
  onLoadMore,
  loadingMoreIds,
  pageSize,
  remainingByLevel,
  startOffsetByLevel,
  onJumpTo,
  TreeNode,
  rightSection,
  role,
  wrapNodes,
  ...boxProps
}: TreeNodeListProps<TData>) {
  const selectedRef = useScrollOnMount<HTMLLIElement>();
  const startOffset = startOffsetByLevel?.get(loadMoreFor) ?? 0;

  return (
    <Box
      component="ul"
      role={role}
      // The rows this level holds above the ones rendered, given their height so that reading a page in the middle
      // of a wide level leaves everything before it where it was.
      pt={startOffset > 0 ? `${startOffset * ROW_HEIGHT}px` : undefined}
      {...boxProps}
    >
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

        const node = (
          <>
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
                  hasMore={item.childrenHaveMore}
                  loadMoreFor={item.id}
                  onLoadMore={onLoadMore}
                  loadingMoreIds={loadingMoreIds}
                  pageSize={pageSize}
                  remainingByLevel={remainingByLevel}
                  startOffsetByLevel={startOffsetByLevel}
                  onJumpTo={onJumpTo}
                  TreeNode={TreeNode}
                  rightSection={rightSection}
                  wrapNodes={wrapNodes}
                />
              ) : (
                <TreeNodeSkeleton depth={depth + 1} />
              ))}
          </>
        );

        return wrapNodes ? (
          <li role="none" key={item.id}>
            {node}
          </li>
        ) : (
          <Fragment key={item.id}>{node}</Fragment>
        );
      })}
      {hasMore && onLoadMore && (
        <TreeLoadMore
          depth={depth}
          isLoading={loadingMoreIds?.has(loadMoreFor) ?? false}
          pageSize={pageSize}
          startOffset={startOffset}
          loadedCount={items.length}
          remaining={remainingByLevel?.get(loadMoreFor)}
          onLoadMore={() => onLoadMore(loadMoreFor)}
          onJumpTo={
            onJumpTo ? (rowIndex) => onJumpTo(loadMoreFor, rowIndex) : undefined
          }
        />
      )}
    </Box>
  );
}

export const TreeNodeList = BaseTreeNodeList;
