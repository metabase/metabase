import { useDashboardContext } from "metabase/dashboard/context";

import { DashboardTabs } from "../../DashboardTabs";

export const Tabs = () => {
  const { dashboard, isEditing } = useDashboardContext();
  if (!dashboard) {
    return null;
  }
  return <DashboardTabs dashboardId={dashboard.id} isEditing={isEditing} />;
};
