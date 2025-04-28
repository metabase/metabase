import _ from "underscore";

import { useDashboardContext } from "metabase/dashboard/context";
import { getDocumentTitle, getFavicon } from "metabase/dashboard/selectors";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useFavicon } from "metabase/hooks/use-favicon";
import { useSelector } from "metabase/lib/redux";

import { useSlowCardNotification } from "./use-slow-card-notification";

export const DashboardTitle = () => {
  const { dashboard } = useDashboardContext();
  const pageFavicon = useSelector(getFavicon);
  const documentTitle = useSelector(getDocumentTitle);

  useFavicon({ favicon: pageFavicon });
  useSlowCardNotification();

  const Component = _.compose(
    title(() => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    })),
    titleWithLoadingTime("loadingStartTime"),
  )(() => null);

  return <Component />;
};
