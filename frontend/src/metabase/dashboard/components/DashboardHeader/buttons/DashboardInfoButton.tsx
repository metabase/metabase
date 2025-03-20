import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDashboardContext } from "metabase/dashboard/context";

export const DashboardInfoButton = () => {
  const { sidebar, closeSidebar, setSidebar } = useDashboardContext();
  const isShowingDashboardInfoSidebar = sidebar?.name === SIDEBAR_NAME.info;

  const handleClick = () => {
    isShowingDashboardInfoSidebar
      ? (closeSidebar())
      : (setSidebar({ name: SIDEBAR_NAME.info }));
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
