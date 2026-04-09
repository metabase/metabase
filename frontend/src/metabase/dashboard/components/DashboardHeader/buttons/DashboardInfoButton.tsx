import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { getIsShowDashboardInfoSidebar } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { ActionIconProps } from "metabase/ui";

export const DashboardInfoButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { closeSidebar, setSidebar } = useDashboardContext();
  const isShowingDashboardInfoSidebar = useSelector(
    getIsShowDashboardInfoSidebar,
  );

  const handleClick = () => {
    if (isShowingDashboardInfoSidebar) {
      closeSidebar();
    } else {
      setSidebar({ name: SIDEBAR_NAME.info });
    }
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
      {...props}
    />
  );
};
