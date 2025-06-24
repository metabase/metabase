import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const DashboardInfoButton = () => {
  const { getIsShowDashboardInfoSidebar, closeSidebar, setSidebar } = useDashboardContext();
  const isShowingDashboardInfoSidebar = getIsShowDashboardInfoSidebar();

  const handleClick = () => {
    isShowingDashboardInfoSidebar
      ? closeSidebar()
      : setSidebar({ name: SIDEBAR_NAME.info });
  };

  useRegisterShortcut(
    [
      {
        id: "dashboard-toggle-info-sidebar",
        perform: handleClick,
      },
    ],
    [isShowingDashboardInfoSidebar],
  );

  return (
    <ToolbarButton
      aria-label={t`More info`}
      tooltipLabel={t`More info`}
      icon="info"
      isActive={isShowingDashboardInfoSidebar}
      disabled={isShowingDashboardInfoSidebar}
      onClick={handleClick}
    />
  );
};
