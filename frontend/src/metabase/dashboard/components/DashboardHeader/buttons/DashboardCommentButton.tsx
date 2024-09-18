import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { closeSidebar, setSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getIsShowDashboardInfoSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export const DashboardCommentButton = () => {
  const dispatch = useDispatch();
  const isShowingDashboardInfoSidebar = useSelector(
    getIsShowDashboardInfoSidebar,
  );

  return (
    <ToolbarButton
      aria-label={t`Comments`}
      tooltipLabel={t`Comments`}
      icon="comment"
      isActive={isShowingDashboardInfoSidebar}
      onClick={() =>
        isShowingDashboardInfoSidebar
          ? dispatch(closeSidebar())
          : dispatch(setSidebar({ name: SIDEBAR_NAME.info }))
      }
    />
  );
};
