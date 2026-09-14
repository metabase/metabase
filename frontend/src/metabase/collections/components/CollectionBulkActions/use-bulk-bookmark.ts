import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useCreateBookmarkMutation } from "metabase/api";
import { trackCollectionItemBookmarked } from "metabase/common/collections/analytics";
import {
  canBookmarkItem,
  getItemBookmarkType,
  isItemBookmarked,
} from "metabase/common/collections/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import type { Bookmark, CollectionItem } from "metabase-types/api";

export const useBulkBookmark = (
  selected: CollectionItem[],
  bookmarks: Bookmark[],
) => {
  const { sendErrorToast } = useMetadataToasts();
  const [createBookmark] = useCreateBookmarkMutation();

  const itemsToBookmark = useMemo(
    () => selected.filter((item) => !isItemBookmarked(item, bookmarks)),
    [selected, bookmarks],
  );

  const canBookmark = useMemo(
    () => itemsToBookmark.length > 0 && selected.every(canBookmarkItem),
    [itemsToBookmark, selected],
  );

  const bookmarkSelected = useCallback(async () => {
    try {
      await Promise.all(
        itemsToBookmark.map(async (item) => {
          await createBookmark({
            id: item.id,
            type: getItemBookmarkType(item),
          }).unwrap();
          trackCollectionItemBookmarked(item);
        }),
      );
    } catch {
      sendErrorToast(t`There was an error bookmarking these items.`);
    }
  }, [itemsToBookmark, createBookmark, sendErrorToast]);

  return { canBookmark, bookmarkSelected };
};
