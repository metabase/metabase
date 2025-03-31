import { useDashboardContext } from "metabase/dashboard/context";
import type { FlexProps } from "metabase/ui";

import { DashboardTabs } from "../../DashboardTabs";

export const Tabs = (flexProps: FlexProps) => {
  const { dashboard, isEditing } = useDashboardContext();
  if (!dashboard) {
    return null;
  }
  return (
    <DashboardTabs
      dashboardId={dashboard.id}
      isEditing={isEditing}
      {...flexProps}
    />
  );
};
