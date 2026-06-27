import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { BoxProps } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import { getInitialExpandedIds } from "./utils";

interface TreeProps<TData = unknown> extends Omit<BoxProps, "children"> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  emptyState?: React.ReactNode;
  initialExpandedIds?: ITreeNodeItem<TData>["id"][];
  /** IDs that stay expanded and cannot be collapsed. */
  pinnedExpandedIds?: ITreeNodeItem<TData>["id"][];
  role?: string;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  TreeNode?: any;
}

function withPinnedIds<TData>(
  ids: Set<ITreeNodeItem<TData>["id"]>,
  pinnedExpandedIds?: ITreeNodeItem<TData>["id"][],
) {
  if (!pinnedExpandedIds?.length) {
    return ids;
  }
  return new Set([...ids, ...pinnedExpandedIds]);
}

function BaseTree<TData = unknown>({
  data,
  selectedId,
  role = "menu",
  emptyState = null,
  initialExpandedIds,
  pinnedExpandedIds,
  onSelect,
  TreeNode = DefaultTreeNode,
  rightSection,
  ...boxProps
}: TreeProps<TData>) {
  const [expandedIds, setExpandedIds] = useState(() => {
    if (initialExpandedIds) {
      return withPinnedIds(new Set(initialExpandedIds), pinnedExpandedIds);
    }
    return withPinnedIds(
      new Set(
        selectedId != null ? getInitialExpandedIds(selectedId, data) : [],
      ),
      pinnedExpandedIds,
    );
  });
  const previousSelectedId = usePrevious(selectedId);
  const prevData = usePrevious(data);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const dataHasChanged = !_.isEqual(data, prevData);
    const selectedItemChanged =
      previousSelectedId !== selectedId && !expandedIds.has(selectedId);

    if (selectedItemChanged || dataHasChanged) {
      setExpandedIds((prev) =>
        withPinnedIds(
          new Set([...prev, ...getInitialExpandedIds(selectedId, data)]),
          pinnedExpandedIds,
        ),
      );
    }
  }, [
    prevData,
    data,
    selectedId,
    previousSelectedId,
    expandedIds,
    pinnedExpandedIds,
  ]);

  useEffect(() => {
    if (!pinnedExpandedIds?.length) {
      return;
    }
    setExpandedIds((prev) => withPinnedIds(prev, pinnedExpandedIds));
  }, [pinnedExpandedIds, data]);

  useEffect(() => {
    if (!initialExpandedIds?.length) {
      return;
    }
    setExpandedIds((prev) =>
      withPinnedIds(
        new Set([...prev, ...initialExpandedIds]),
        pinnedExpandedIds,
      ),
    );
  }, [initialExpandedIds, data, pinnedExpandedIds]);

  const handleToggleExpand = useCallback(
    (itemId: string | number) => {
      if (expandedIds.has(itemId) && pinnedExpandedIds?.includes(itemId)) {
        return;
      }
      if (expandedIds.has(itemId)) {
        setExpandedIds((prev) =>
          withPinnedIds(
            new Set([...prev].filter((id) => id !== itemId)),
            pinnedExpandedIds,
          ),
        );
      } else {
        setExpandedIds((prev) =>
          withPinnedIds(new Set([...prev, itemId]), pinnedExpandedIds),
        );
      }
    },
    [expandedIds, pinnedExpandedIds],
  );

  if (data.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <TreeNodeList
      role={role}
      items={data}
      TreeNode={TreeNode}
      expandedIds={expandedIds}
      selectedId={selectedId}
      depth={0}
      onSelect={onSelect}
      onToggleExpand={handleToggleExpand}
      rightSection={rightSection}
      {...boxProps}
    />
  );
}

export const Tree = Object.assign(BaseTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
