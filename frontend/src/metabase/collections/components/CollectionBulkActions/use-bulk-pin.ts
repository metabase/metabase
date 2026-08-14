import { useCallback, useMemo } from "react";

import { isItemPinned } from "metabase/common/collections/utils";
import { canPinItem, isPinnable, useSetPinned } from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

export const useBulkPin = (
  selected: CollectionItem[],
  collection: Collection,
) => {
  const setPinned = useSetPinned();

  const pinnedItems = useMemo(() => selected.filter(isItemPinned), [selected]);
  const unpinnedItems = useMemo(
    () => selected.filter((item) => !isItemPinned(item)),
    [selected],
  );

  const canPinAll = useMemo(
    () => unpinnedItems.every((item) => canPinItem(item, collection)),
    [unpinnedItems, collection],
  );

  const canUnpinAll = useMemo(
    () => pinnedItems.every((item) => canPinItem(item, collection)),
    [pinnedItems, collection],
  );

  const pinSelected = useCallback(
    () =>
      Promise.all(
        unpinnedItems.filter(isPinnable).map((item) => setPinned(item, true)),
      ),
    [unpinnedItems, setPinned],
  );

  const unpinSelected = useCallback(
    () =>
      Promise.all(
        pinnedItems.filter(isPinnable).map((item) => setPinned(item, false)),
      ),
    [pinnedItems, setPinned],
  );

  return {
    hasPinned: pinnedItems.length > 0,
    hasUnpinned: unpinnedItems.length > 0,
    canPinAll,
    canUnpinAll,
    pinSelected,
    unpinSelected,
  };
};
