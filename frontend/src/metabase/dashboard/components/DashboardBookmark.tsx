import { BookmarkToggle } from "metabase/common/components/BookmarkToggle";
import { useBookmarkListQuery } from "metabase/common/hooks";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { Bookmarks } from "metabase/entities/bookmarks";
import { useDispatch } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { DashboardId, Bookmark as IBookmark } from "metabase-types/api";

import { trackDashboardBookmarked } from "../analytics";

export interface DashboardBookmarkProps {
  isBookmarked: boolean;
}

export const DashboardBookmark = (): JSX.Element | null => {
  const { data: bookmarks = [] } = useBookmarkListQuery();
  const { dashboard } = useDashboardContext();
  const dispatch = useDispatch();

  const isBookmarked = dashboard
    ? getIsBookmarked({
        dashboardId: dashboard.id,
        bookmarks,
      })
    : false;

  const handleCreateBookmark = () => {
    if (dashboard) {
      const id = dashboard.id;
      dispatch(Bookmarks.actions.create({ id, type: "dashboard" }));
      trackDashboardBookmarked();
    }
  };

  const handleDeleteBookmark = () => {
    if (dashboard) {
      const id = dashboard.id;
      dispatch(Bookmarks.actions.delete({ id, type: "dashboard" }));
    }
  };

  useRegisterShortcut(
    [
      {
        id: "dashboard-bookmark",
        perform: () =>
          isBookmarked ? handleDeleteBookmark() : handleCreateBookmark(),
      },
    ],
    [isBookmarked],
  );

  return (
    <BookmarkToggle
      isBookmarked={isBookmarked}
      onCreateBookmark={handleCreateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
    />
  );
};

type IsBookmarkedSelectorProps = {
  bookmarks: IBookmark[];
  dashboardId: DashboardId;
};

export const getIsBookmarked = ({
  bookmarks,
  dashboardId,
}: IsBookmarkedSelectorProps) =>
  bookmarks.some(
    (bookmark) =>
      bookmark.type === "dashboard" && bookmark.item_id === dashboardId,
  );
