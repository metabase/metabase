export const getIsBookmarked = (state, props) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "dashboard" && bookmark.item_id === props.dashboardId,
  );
