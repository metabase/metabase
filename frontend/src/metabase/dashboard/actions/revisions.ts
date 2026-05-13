import { t } from "ttag";

import { revisionApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { entityCompatibleQuery } from "metabase/entities/utils";
import { createThunkAction } from "metabase/redux";
import { REVERT_TO_REVISION } from "metabase/redux/dashboard";
import { addUndo } from "metabase/redux/undo";
import type { DashboardId, Revision } from "metabase-types/api";

export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  (dashboardId: DashboardId, revision: Revision) => {
    return async (dispatch) => {
      try {
        await entityCompatibleQuery(
          {
            id: dashboardId,
            entity: "dashboard",
            revision_id: revision.id,
          },
          dispatch,
          revisionApi.endpoints.revertRevision,
        );
      } catch (error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: getErrorMessage(
              error,
              t`Failed to revert to previous version.`,
            ),
          }),
        );
        throw error;
      }
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
