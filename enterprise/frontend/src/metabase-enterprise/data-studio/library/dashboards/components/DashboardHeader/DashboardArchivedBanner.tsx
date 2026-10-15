import { t } from "ttag";

import { useDeleteDashboardMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { useSetArchive } from "metabase/archive/hooks";
import { useSetCollection } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Dashboard } from "metabase-types/api";

type DashboardArchivedBannerProps = {
  dashboard: Dashboard;
};

export function DashboardArchivedBanner({
  dashboard,
}: DashboardArchivedBannerProps) {
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const archive = useSetArchive();
  const setCollection = useSetCollection();
  const [deleteDashboard] = useDeleteDashboardMutation();

  return (
    <ArchivedEntityBanner
      name={dashboard.name}
      entityType={t`dashboard`}
      canMove={dashboard.can_write && !isReadOnly}
      canRestore={dashboard.can_restore && !isReadOnly}
      canDelete={dashboard.can_delete && !isReadOnly}
      onUnarchive={() =>
        archive({ id: dashboard.id, model: "dashboard" }, false)
      }
      onMove={({ id }) =>
        setCollection({ id: dashboard.id, model: "dashboard" }, { id })
      }
      onDeletePermanently={async () => {
        await deleteDashboard(dashboard.id).unwrap();
        navigate(Urls.dataStudioDashboards());
        dispatch(
          addUndo({ message: t`This item has been permanently deleted.` }),
        );
      }}
    />
  );
}
