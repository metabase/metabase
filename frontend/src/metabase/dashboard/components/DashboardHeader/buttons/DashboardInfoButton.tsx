import { t } from "ttag";

import { closeSidebar, setSidebar } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getIsShowDashboardInfoSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

export const DashboardInfoButton = () => {
  const dispatch = useDispatch();

  const isShowingDashboardInfoSidebar = useSelector(
    getIsShowDashboardInfoSidebar,
  );

  return (
    <Tooltip label={t`More info`}>
      <DashboardHeaderButton
        icon="info"
        isActive={isShowingDashboardInfoSidebar}
        onClick={() =>
          isShowingDashboardInfoSidebar
            ? dispatch(closeSidebar())
            : dispatch(setSidebar({ name: SIDEBAR_NAME.info }))
        }
      />
    </Tooltip>
  );
};
