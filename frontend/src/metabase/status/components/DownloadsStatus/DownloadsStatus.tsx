import { useCallback, useEffect, useState } from "react";

import { useSelector, useDispatch } from "metabase/lib/redux";
import { clearAll, getDownloads } from "metabase/redux/downloads";
import useStatusVisibility from "metabase/status/hooks/use-status-visibility";

import { DownloadsStatusLarge } from "../DownloadsStatusLarge";
import { DownloadsStatusSmall } from "../DownloadsStatusSmall";
import { isCompleted } from "../utils/downloads";

export const DownloadsStatus = (): JSX.Element | null => {
  const [isExpanded, setIsExpanded] = useState(true);
  const downloads = useSelector(getDownloads);
  const dispatch = useDispatch();
  const hasActiveDownloads =
    downloads.length > 0 && !downloads.every(isCompleted);
  const isVisible = useStatusVisibility(hasActiveDownloads);

  const handleDismiss = useCallback(() => {
    dispatch(clearAll());
  }, [dispatch]);

  useEffect(() => {
    if (!isVisible && !hasActiveDownloads && downloads.length > 0) {
      handleDismiss();
    }
  }, [isVisible, handleDismiss, downloads.length, hasActiveDownloads]);

  if (downloads.length === 0) {
    return null;
  }

  return isExpanded ? (
    <DownloadsStatusLarge
      downloads={downloads}
      onDismiss={handleDismiss}
      onCollapse={() => setIsExpanded(false)}
    />
  ) : (
    <DownloadsStatusSmall
      downloads={downloads}
      onExpand={() => setIsExpanded(true)}
    />
  );
};
