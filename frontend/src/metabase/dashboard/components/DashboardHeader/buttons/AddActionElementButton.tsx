import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";

export const AddActionElementButton = () => {
  const { dashboard, selectedTabId, addActionToDashboard } =
    useDashboardContext();

  const onAddAction = () => {
    if (dashboard) {
      addActionToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
        displayType: "button",
        action: {},
      });
    }
  };

  return (
    <ToolbarButton
      aria-label={t`Add action`}
      onClick={onAddAction}
      icon="click"
      tooltipLabel={t`Add action button`}
    />
  );
};
