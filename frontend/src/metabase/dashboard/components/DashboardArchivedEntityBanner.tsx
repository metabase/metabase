import { Api } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/ArchivedEntityBanner";
import { Dashboards } from "metabase/entities/dashboards";
import { useDispatch } from "metabase/redux";

import { useDashboardContext } from "../context";

export const DashboardArchivedEntityBanner = () => {
  const {
    dashboard,
    setArchivedDashboard,
    moveDashboardToCollection,
    deletePermanently,
  } = useDashboardContext();

  const dispatch = useDispatch();
  const invalidateBookmarks = () =>
    dispatch(Api.util.invalidateTags([listTag("bookmark")]));

  if (!dashboard) {
    return null;
  }

  const name = dashboard?.name;
  const canWrite = Boolean(dashboard?.can_write);
  const canRestore = Boolean(dashboard?.can_restore);
  const canDelete = Boolean(dashboard?.can_delete);

  return (
    <ArchivedEntityBanner
      name={name}
      entityType="dashboard"
      canMove={canWrite}
      canRestore={canRestore}
      canDelete={canDelete}
      onUnarchive={async () => {
        await setArchivedDashboard(false);
        invalidateBookmarks();
      }}
      onMove={({ id }) => moveDashboardToCollection({ id })}
      onDeletePermanently={() => {
        const deleteAction = Dashboards.actions.delete({ id: dashboard?.id });
        deletePermanently(deleteAction);
      }}
    />
  );
};
