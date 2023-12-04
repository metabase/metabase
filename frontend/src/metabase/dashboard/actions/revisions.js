import { createThunkAction } from "metabase/lib/redux";
import Revision from "metabase/entities/revisions";

import { fetchDashboard, fetchDashboardCardData } from "./data-fetching";

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  revision => {
    return async dispatch => {
      await dispatch(Revision.objectActions.revert(revision));
      await dispatch(
        fetchDashboard({
          dashId: revision.model_id,
          queryParams: null,
        }),
      );
      await dispatch(
        fetchDashboardCardData({ reload: false, clearCache: true }),
      );
    };
  },
);
