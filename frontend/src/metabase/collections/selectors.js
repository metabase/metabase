export const getIsBookmarked = (state, props) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "collection" && bookmark.item_id === props.collectionId,
  );
