import { useLocation } from "react-use";

import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { useSelector } from "metabase/utils/redux";

import { useSetting } from "./use-setting";

export const useIsAtHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const siteUrl = useSetting("site-url");
  const location = useLocation();
  const pathname = location?.href?.replace(siteUrl, "");

  return (
    dashboardId != null &&
    pathname != null &&
    pathname.startsWith(`/dashboard/${dashboardId}`)
  );
};
