import { revisionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { createThunkAction } from "metabase/redux";
import { REVERT_TO_REVISION } from "metabase/redux/dashboard";
import type { DashboardId, Revision } from "metabase-types/api";

export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  (dashboardId: DashboardId, revision: Revision) => {
    return async (dispatch) => {
      await runRtkEndpoint(
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
          queryParams: {},
        }),
      );
      await dispatch(
        fetchDashboardCardData({ reload: false, clearCache: true }),
      );
    };
  },
);
