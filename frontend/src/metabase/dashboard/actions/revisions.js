import { revisionApi } from "metabase/api";
import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { entityCompatibleQuery } from "metabase/lib/entities";
import { createThunkAction } from "metabase/lib/redux";

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  (dashboardId, revision) => {
    return async (dispatch) => {
      await entityCompatibleQuery(
        {
          id: dashboardId,
          entity: "dashboard",
          revision_id: revision.id,
        },
        dispatch,
        revisionApi.endpoints.revertRevision,
      );
      await dispatch(
        fetchDashboard({
          dashId: dashboardId,
          queryParams: null,
        }),
      );
      await dispatch(
        fetchDashboardCardData({ reload: false, clearCache: true }),
      );
    };
  },
);
