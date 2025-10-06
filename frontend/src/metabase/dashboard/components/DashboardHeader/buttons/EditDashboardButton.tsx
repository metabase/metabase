import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const EditDashboardButton = () => {
  const { dashboard, onRefreshPeriodChange, setEditingDashboard } =
    useDashboardContext();
  const onBeginEditing = () => {
    if (dashboard) {
      onRefreshPeriodChange(null);
      setEditingDashboard(dashboard);
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
