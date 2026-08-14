import { useCallback, useMemo } from "react";

import { useCreateBookmarkMutation } from "metabase/api";
import { trackCollectionItemBookmarked } from "metabase/common/collections/analytics";
import {
  canBookmarkItem,
  getItemBookmarkType,
  isItemBookmarked,
} from "metabase/common/collections/utils";
import type { Bookmark, CollectionItem } from "metabase-types/api";

export const useBulkBookmark = (
  selected: CollectionItem[],
  bookmarks: Bookmark[],
) => {
  const [createBookmark] = useCreateBookmarkMutation();

  const canBookmark = useMemo(
    () => selected.every(canBookmarkItem),
    [selected],
  );

  const bookmarkSelected = useCallback(
    () =>
      Promise.all(
        selected
          .filter((item) => !isItemBookmarked(item, bookmarks))
          .map(async (item) => {
            const result = await createBookmark({
              id: item.id,
              type: getItemBookmarkType(item),
            });
            if (!("error" in result)) {
              trackCollectionItemBookmarked(item);
            }
          }),
      ),
    [selected, bookmarks, createBookmark],
  );

  return { canBookmark, bookmarkSelected };
};
