import { useCallback } from "react";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import type { Dashboard } from "metabase-types/api";

export interface DashboardBookmarkProps {
  dashboard: Dashboard;
  isBookmarked: boolean;
  onCreateBookmark: (dashboard: Dashboard) => void;
  onDeleteBookmark: (dashboard: Dashboard) => void;
}

export const DashboardBookmark = ({
  dashboard,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
}: DashboardBookmarkProps): JSX.Element | null => {
  const handleCreateBookmark = useCallback(() => {
    onCreateBookmark(dashboard);
  }, [dashboard, onCreateBookmark]);

  const handleDeleteBookmark = useCallback(() => {
    onDeleteBookmark(dashboard);
  }, [dashboard, onDeleteBookmark]);

  return (
    <BookmarkToggle
      isBookmarked={isBookmarked}
      onCreateBookmark={handleCreateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
    />
  );
};
