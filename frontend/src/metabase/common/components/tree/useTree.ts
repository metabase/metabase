import { useCallback, useEffect, useRef, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { TreeProps } from "./Tree";
import type { ITreeNodeItem } from "./types";
import { getInitialExpandedIds } from "./utils";

type UseTreeOptions<TData = unknown> = Pick<
  TreeProps<TData>,
  "data" | "selectedId" | "initialExpandedIds" | "pinnedExpandedIds"
> & {
  freezeAutoExpandOnManualToggle?: boolean;
};

export interface TreeController<TData = unknown> {
  data: ITreeNodeItem<TData>[];
  selectedId?: ITreeNodeItem<TData>["id"];
  expandedIds: Set<ITreeNodeItem<TData>["id"]>;
  setExpandedIds: (ids: Set<ITreeNodeItem<TData>["id"]>) => void;
  handleToggleExpand: (itemId: ITreeNodeItem<TData>["id"]) => void;
  collapse: (itemId: ITreeNodeItem<TData>["id"]) => void;
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

export function useTree<TData = unknown>({
  data = [],
  selectedId,
  initialExpandedIds,
  pinnedExpandedIds,
  freezeAutoExpandOnManualToggle = false,
}: UseTreeOptions<TData>) {
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

  const hasManuallyToggledRef = useRef(false);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    if (freezeAutoExpandOnManualToggle && hasManuallyToggledRef.current) {
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
  }, [
    prevData,
    data,
    selectedId,
    previousSelectedId,
    freezeAutoExpandOnManualToggle,
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
      hasManuallyToggledRef.current = true;
      if (expandedIds.has(itemId)) {
        setExpandedIds(
          (prev) => new Set([...prev].filter((id) => id !== itemId)),
        );
      } else {
        setExpandedIds((prev) => new Set([...prev, itemId]));
      }
    },
    [expandedIds, pinnedExpandedIds],
  );

  const collapse = useCallback(
    (itemId: string | number) => {
      if (pinnedExpandedIds?.includes(itemId)) {
        return;
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    },
    [pinnedExpandedIds],
  );

  return {
    data,
    selectedId,
    expandedIds,
    setExpandedIds,
    handleToggleExpand,
    collapse,
  };
}
