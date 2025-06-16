import _ from "underscore";

import { useDashboardContext } from "metabase/dashboard/context";
import { getDocumentTitle } from "metabase/dashboard/selectors";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useSelector } from "metabase/lib/redux";

/**
 * Updates the browser tab title to reflect the current dashboard name and loading state.
 * Uses the dashboard from the dashboard context to show loading times when the
 * dashboard is slow and then shows the title
 */

export const DashboardTitle = () => {
  const { dashboard } = useDashboardContext();
  const documentTitle = useSelector(getDocumentTitle);

  const Component = _.compose(
    title(() => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    })),
    titleWithLoadingTime("loadingStartTime"),
  )(() => null);

  return <Component />;
};
