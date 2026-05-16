import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
} from "metabase/api";
import { BookmarkToggle } from "metabase/common/components/BookmarkToggle";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { DashboardId, Bookmark as IBookmark } from "metabase-types/api";

import { trackDashboardBookmarked } from "../analytics";

export interface DashboardBookmarkProps {
  isBookmarked: boolean;
}

export const DashboardBookmark = (): JSX.Element | null => {
  const { data: bookmarks = [] } = useListBookmarksQuery();
  const { dashboard } = useDashboardContext();
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();

  const isBookmarked = dashboard
    ? getIsBookmarked({
        dashboardId: dashboard.id,
        bookmarks,
      })
    : false;

  const handleCreateBookmark = () => {
    if (dashboard) {
      createBookmark({ id: dashboard.id, type: "dashboard" });
      trackDashboardBookmarked();
    }
  };

  const handleDeleteBookmark = () => {
    if (dashboard) {
      deleteBookmark({ id: dashboard.id, type: "dashboard" });
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
