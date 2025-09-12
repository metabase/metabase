import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import Revisions from "metabase/entities/revisions";
import { createThunkAction } from "metabase/lib/redux";

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  (dashboardId, revision) => {
    return async (dispatch) => {
      await dispatch(
        Revisions.objectActions.revert(dashboardId, "dashboard", revision),
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
