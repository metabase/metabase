import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { setEditingDashboard } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import type { DashboardRefreshPeriodControls } from "metabase/dashboard/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

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

  useRegisterShortcut(
    [
      {
        id: "dashboard-edit",
        perform: onBeginEditing,
      },
    ],
    [dashboard],
  );

  return (
    <ToolbarButton
      tooltipLabel={t`Edit dashboard`}
      visibleOnSmallScreen={false}
      key="edit"
      aria-label={t`Edit dashboard`}
      icon="pencil"
      onClick={onBeginEditing}
    />
  );
};
