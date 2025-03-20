import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";

export const DashboardInfoButton = () => {
  const { sidebar, closeSidebar, setSidebar } = useDashboardContext();
  const isShowingDashboardInfoSidebar = sidebar?.name === SIDEBAR_NAME.info;

  return (
    <ToolbarButton
      aria-label={t`More info`}
      tooltipLabel={t`More info`}
      icon="info"
      isActive={isShowingDashboardInfoSidebar}
      disabled={isShowingDashboardInfoSidebar}
      onClick={() =>
        isShowingDashboardInfoSidebar
          ? closeSidebar()
          : setSidebar({ name: SIDEBAR_NAME.info })
      }
    />
  );
};
