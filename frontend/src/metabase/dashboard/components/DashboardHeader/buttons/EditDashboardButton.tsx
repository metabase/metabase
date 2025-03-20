import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";

export const EditDashboardButton = () => {
  const { dashboard, onRefreshPeriodChange, setEditingDashboard } =
    useDashboardContext();

  const onBeginEditing = () => {
    if (dashboard) {
      onRefreshPeriodChange(null);
      setEditingDashboard(dashboard);
    }
  };

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
