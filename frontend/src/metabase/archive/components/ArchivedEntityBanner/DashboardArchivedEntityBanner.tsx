import { useDashboardContext } from "metabase/dashboard/context";
import Dashboards from "metabase/entities/dashboards";

import { ArchivedEntityBanner } from "./ArchivedEntityBanner";

export const DashboardArchivedEntityBanner = () => {
  const {
    dashboard,
    setArchivedDashboard,
    moveDashboardToCollection,
    deletePermanently,
  } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <ArchivedEntityBanner
      name={dashboard?.name}
      entityType="dashboard"
      canMove={!!dashboard?.can_write}
      canRestore={!!dashboard?.can_restore}
      canDelete={!!dashboard?.can_delete}
      onUnarchive={() => setArchivedDashboard(false)}
      onMove={({ id }) => moveDashboardToCollection({ id })}
      onDeletePermanently={() => {
        const deleteAction = Dashboards.actions.delete({ id: dashboard?.id });
        deletePermanently(deleteAction);
      }}
    />
  );
};
