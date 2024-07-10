import { t } from "ttag";

import { setEditingDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import type { DashboardRefreshPeriodControls } from "metabase/dashboard/types";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { DashboardHeaderButton } from "./DashboardHeaderButton";

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
    <DashboardHeaderButton
      tooltipLabel={t`Edit dashboard`}
      visibleOnSmallScreen={false}
      key="edit"
      aria-label={t`Edit dashboard`}
      icon="pencil"
      onClick={onBeginEditing}
    />
  );
};
