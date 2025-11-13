import { useDashboardContext } from "metabase/dashboard/context";
import { getDocumentTitle } from "metabase/dashboard/selectors";
import { usePageTitleWithLoadingTime } from "metabase/hooks/use-page-title";
import { useSelector } from "metabase/lib/redux";

/**
 * Updates the browser tab title to reflect the current dashboard name and loading state.
 * Uses the dashboard from the dashboard context to show loading times when the
 * dashboard is slow and then shows the title
 */

export const DashboardTitle = () => {
  const { dashboard, loadingStartTime, isRunning } = useDashboardContext();
  const documentTitle = useSelector(getDocumentTitle);

  usePageTitleWithLoadingTime(documentTitle || dashboard?.name || "", {
    titleIndex: 1,
    startTime: loadingStartTime,
    isRunning,
  });

  return null;
};
