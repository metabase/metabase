import type { State } from "metabase-types/store";
import type { Bookmark, CollectionId } from "metabase-types/api";

type GetIsBookmarkedProps = {
  bookmarks: Bookmark[];
  collectionId: CollectionId;
};

export const getIsBookmarked = (_state: State, props: GetIsBookmarkedProps) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "collection" && bookmark.item_id === props.collectionId,
  );
