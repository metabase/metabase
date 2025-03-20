import { useDashboardContext } from "metabase/dashboard/context";

import { DashboardTabs } from "../../DashboardTabs";

export const Tabs = () => {
  const { dashboard, isEditing } = useDashboardContext();
  return <DashboardTabs dashboardId={dashboard.id} isEditing={isEditing} />;
};
