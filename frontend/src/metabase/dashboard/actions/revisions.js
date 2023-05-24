import { createThunkAction } from "metabase/lib/redux";

import { fetchDashboard, fetchDashboardCardData } from "./data-fetching";

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  revision => {
    return async dispatch => {
      await revision.revert();
      await dispatch(fetchDashboard(revision.model_id, null));
      await dispatch(
        fetchDashboardCardData({ reload: false, clearCache: true }),
      );
    };
  },
);
