import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { setCollectionItemPinnedAndTrack } from "metabase/common/collections/analytics";
import { isItemPinned } from "metabase/common/collections/utils";
import {
  canPinItem,
  isPinnable,
  useMetadataToasts,
  useSetPinned,
} from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

export const useBulkPin = (
  selected: CollectionItem[],
  collection: Collection,
) => {
  const { sendErrorToast } = useMetadataToasts();
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

  const pinSelected = useCallback(async () => {
    try {
      await Promise.all(
        unpinnedItems.filter(isPinnable).map((item) =>
          setCollectionItemPinnedAndTrack({
            item,
            pinned: true,
            triggeredFrom: "bulk_action_bar",
            setPinned: () => setPinned(item, true).unwrap(),
          }),
        ),
      );
    } catch {
      sendErrorToast(t`There was an error pinning these items.`);
    }
  }, [unpinnedItems, setPinned, sendErrorToast]);

  const unpinSelected = useCallback(async () => {
    try {
      await Promise.all(
        pinnedItems.filter(isPinnable).map((item) =>
          setCollectionItemPinnedAndTrack({
            item,
            pinned: false,
            triggeredFrom: "bulk_action_bar",
            setPinned: () => setPinned(item, false).unwrap(),
          }),
        ),
      );
    } catch {
      sendErrorToast(t`There was an error unpinning these items.`);
    }
  }, [pinnedItems, setPinned, sendErrorToast]);

  return {
    hasPinned: pinnedItems.length > 0,
    hasUnpinned: unpinnedItems.length > 0,
    canPinAll,
    canUnpinAll,
    pinSelected,
    unpinSelected,
  };
};
