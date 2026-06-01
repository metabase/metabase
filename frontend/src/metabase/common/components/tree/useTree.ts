import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { TreeProps } from "./Tree";
import type { ITreeNodeItem } from "./types";
import { getInitialExpandedIds } from "./utils";

type UseTreeOptions<TData = unknown> = Pick<
  TreeProps<TData>,
  "data" | "selectedId" | "initialExpandedIds"
>;

export interface TreeController<TData = unknown> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  expandedIds: Set<ITreeNodeItem<TData>["id"]>;
  setExpandedIds: (ids: Set<ITreeNodeItem<TData>["id"]>) => void;
  handleToggleExpand: (itemId: ITreeNodeItem<TData>["id"]) => void;
  collapse: (itemId: ITreeNodeItem<TData>["id"]) => void;
}

export function useTree<TData = unknown>({
  data = [],
  selectedId,
  initialExpandedIds,
}: UseTreeOptions<TData>) {
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

  const collapse = useCallback((itemId: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  return {
    data,
    selectedId,
    expandedIds,
    setExpandedIds,
    handleToggleExpand,
    collapse,
  };
}
