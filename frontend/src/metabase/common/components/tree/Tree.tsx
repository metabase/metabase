import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { BoxProps } from "metabase/ui";

import { TreeNode as DefaultTreeNode } from "./TreeNode";
import { TreeNodeList } from "./TreeNodeList";
import type { ITreeNodeItem } from "./types";
import { getInitialExpandedIds } from "./utils";

export interface TreeHandle {
  collapse: (id: ITreeNodeItem["id"]) => void;
}

interface TreeProps<TData = unknown> extends Omit<BoxProps, "children"> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  emptyState?: React.ReactNode;
  initialExpandedIds?: ITreeNodeItem<TData>["id"][];
  role?: string;
  onSelect?: (item: ITreeNodeItem<TData>) => void;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  TreeNode?: any;
}

function BaseTree<TData = unknown>(
  {
    data,
    selectedId,
    role = "menu",
    emptyState = null,
    initialExpandedIds,
    onSelect,
    TreeNode = DefaultTreeNode,
    rightSection,
    ...boxProps
  }: TreeProps<TData>,
  ref: React.Ref<TreeHandle>,
) {
  const [expandedIds, setExpandedIds] = useState(() => {
    if (initialExpandedIds) {
      return new Set(initialExpandedIds);
    }
    return new Set(
      selectedId != null ? getInitialExpandedIds(selectedId, data) : [],
    );
  });
  const previousSelectedId = usePrevious(selectedId);
  const prevData = usePrevious(data);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const dataHasChanged = !_.isEqual(data, prevData);
    const selectedItemChanged = previousSelectedId !== selectedId;

    if (selectedItemChanged || dataHasChanged) {
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(selectedId, data)]),
      );
    }
  }, [prevData, data, selectedId, previousSelectedId, expandedIds]);

  useImperativeHandle(
    ref,
    () => ({
      collapse(id) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    }),
    [],
  );

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

const ForwardedTree = forwardRef(BaseTree) as <TData = unknown>(
  props: TreeProps<TData> & React.RefAttributes<TreeHandle>,
) => React.ReactElement | null;

export const Tree = Object.assign(ForwardedTree, {
  Node: DefaultTreeNode,
  NodeList: TreeNodeList,
});
