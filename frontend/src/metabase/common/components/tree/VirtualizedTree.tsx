import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import * as React from "react";
import { usePrevious } from "react-use";

import { Box } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import S from "./VirtualizedTree.module.css";
import type { ITreeNodeItem, TreeNodeComponent } from "./types";
import { getAllExpandableIds, getInitialExpandedIds } from "./utils";

interface VirtualizedTreeProps {
  data: ITreeNodeItem[];
  selectedId?: ITreeNodeItem["id"];
  role?: string;
  emptyState?: React.ReactNode;
  initiallyExpanded?: boolean;
  onSelect?: (item: ITreeNodeItem) => void;
  rightSection?: (item: ITreeNodeItem) => React.ReactNode;
  TreeNode?: TreeNodeComponent;
  className?: string;
}

interface FlatTreeItem {
  item: ITreeNodeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

const ITEM_HEIGHT = 36;

function flattenTree(
  nodes: ITreeNodeItem[],
  expandedIds: Set<ITreeNodeItem["id"]>,
  depth = 0,
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  for (const node of nodes) {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = hasChildren && expandedIds.has(node.id);

    result.push({
      item: node,
      depth,
      hasChildren,
      isExpanded,
    });

    if (isExpanded && node.children) {
      result.push(...flattenTree(node.children, expandedIds, depth + 1));
    }
  }

  return result;
}

export function VirtualizedTree({
  data,
  selectedId,
  role = "menu",
  emptyState = null,
  initiallyExpanded = false,
  onSelect,
  TreeNode = DefaultTreeNode,
  className,
  rightSection,
}: VirtualizedTreeProps) {
  const [expandedIds, setExpandedIds] = useState(() => {
    if (initiallyExpanded) {
      return new Set(getAllExpandableIds(data));
    }
    return new Set(
      selectedId != null ? getInitialExpandedIds(selectedId, data) : [],
    );
  });

  const previousSelectedId = usePrevious(selectedId);
  const prevData = usePrevious(data);

  useEffect(() => {
    if (initiallyExpanded && data !== prevData) {
      setExpandedIds(new Set(getAllExpandableIds(data)));
      return;
    }

    if (!selectedId) {
      return;
    }
    const selectedItemChanged =
      previousSelectedId !== selectedId && !expandedIds.has(selectedId);
    if (selectedItemChanged || data !== prevData) {
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(selectedId, data)]),
      );
    }
  }, [
    prevData,
    data,
    selectedId,
    previousSelectedId,
    expandedIds,
    initiallyExpanded,
  ]);

  const handleToggleExpand = useCallback(
    (itemId: string | number) => {
      if (expandedIds.has(itemId)) {
        setExpandedIds(
          (prev) => new Set([...prev].filter((id) => id !== itemId)),
        );
      } else {
        setExpandedIds((prev) => new Set([...prev, itemId]));
      }
    },
    [expandedIds],
  );

  const flatItems = flattenTree(data, expandedIds);
  const parentRef = useRef<HTMLDivElement>(null);

  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => ITEM_HEIGHT, []);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (selectedId === undefined) {
      return;
    }
    const index = flatItems.findIndex(
      (flatItem) => flatItem.item.id === selectedId,
    );
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedId, flatItems, virtualizer]);

  if (data.length === 0) {
    return <React.Fragment>{emptyState}</React.Fragment>;
  }

  return (
    <Box ref={parentRef} px="md" className={cx(S.scrollContainer, className)}>
      <Box
        component="ul"
        role={role}
        className={S.listContainer}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const flatItem = flatItems[virtualRow.index];
          const { item, depth, hasChildren, isExpanded } = flatItem;
          const isSelected = selectedId === item.id;

          return (
            <Box
              key={virtualRow.key}
              data-index={virtualRow.index}
              component="li"
              className={S.listItem}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <TreeNode
                item={item}
                onSelect={onSelect ? () => onSelect(item) : undefined}
                onToggleExpand={() => handleToggleExpand(item.id)}
                isSelected={isSelected}
                isExpanded={isExpanded}
                hasChildren={hasChildren}
                depth={depth}
                rightSection={rightSection}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
