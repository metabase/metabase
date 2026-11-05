import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { getIsShowDashboardInfoSidebar } from "metabase/dashboard/selectors";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useSelector } from "metabase/redux";
import type { ActionIconProps } from "metabase/ui";

export const DashboardInfoButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { setSidebar } = useDashboardContext();
  const isShowingDashboardInfoSidebar = useSelector(
    getIsShowDashboardInfoSidebar,
  );

  const openInfoSidebar = () => setSidebar({ name: SIDEBAR_NAME.info });

  useRegisterShortcut(
    [
      {
        id: "dashboard-toggle-info-sidebar",
        // Closing is the open sheet's own hotkey, so its exit transition plays
        perform: () => {
          if (!isShowingDashboardInfoSidebar) {
            openInfoSidebar();
          }
        },
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
      onClick={openInfoSidebar}
      {...props}
    />
  );
};
