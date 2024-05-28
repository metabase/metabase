import type { Bookmark, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

type GetIsBookmarkedProps = {
  bookmarks: Bookmark[];
  collectionId: CollectionId;
};

export const getIsBookmarked = (_state: State, props: GetIsBookmarkedProps) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "collection" && bookmark.item_id === props.collectionId,
  );
