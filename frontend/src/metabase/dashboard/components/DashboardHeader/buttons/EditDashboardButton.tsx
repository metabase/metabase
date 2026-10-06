import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useIsInLibraryDashboards } from "metabase/common/data-studio/library-dashboards";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const EditDashboardButton = () => {
  const { dashboard, onRefreshPeriodChange, setEditingDashboard } =
    useDashboardContext();
  // PROTOTYPE: Library dashboards are edited from Data Studio
  const isLibraryDashboard = useIsInLibraryDashboards(dashboard?.collection);

  const onBeginEditing = () => {
    if (dashboard && !isLibraryDashboard) {
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
    [dashboard, isLibraryDashboard],
  );

  if (isLibraryDashboard) {
    return null;
  }

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
