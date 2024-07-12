import { t } from "ttag";

import { setEditingDashboard } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import type { DashboardRefreshPeriodControls } from "metabase/dashboard/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

export const EditDashboardButton = ({
  onRefreshPeriodChange,
}: Pick<DashboardRefreshPeriodControls, "onRefreshPeriodChange">) => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboardComplete);

  const onBeginEditing = () => {
    if (dashboard) {
      onRefreshPeriodChange(null);
      dispatch(setEditingDashboard(dashboard));
    }
  };

  return (
    <Tooltip key="edit-dashboard" label={t`Edit dashboard`}>
      <DashboardHeaderButton
        visibleOnSmallScreen={false}
        key="edit"
        aria-label={t`Edit dashboard`}
        icon="pencil"
        onClick={onBeginEditing}
      />
    </Tooltip>
  );
};
