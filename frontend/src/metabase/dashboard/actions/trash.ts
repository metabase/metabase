import { t } from "ttag";
import _ from "underscore";

import { getTrashUndoMessage } from "metabase/archive/utils";
import { canonicalCollectionId } from "metabase/collections/utils";
import Dashboards from "metabase/entities/dashboards";
import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { fetchDashboard } from "./data-fetching";

// just using the entity action doesn't cause the dashboard to live update
// calling fetchDashboard ensures that the view updates with the last values
export const SET_ARCHIVED_DASHBOARD =
  "metabase/dashboard/SET_ARCHIVED_DASHBOARD";
export const setArchivedDashboard = createThunkAction(
  SET_ARCHIVED_DASHBOARD,
  function (archived = true, undoing = false) {
    return async function (dispatch, getState) {
      const { dashboardId, dashboards } = getState().dashboard;
      const dashboard = dashboardId
        ? dashboards[dashboardId]
        : { name: "Dashboard" };

      await dispatch(
        Dashboards.actions.update({ id: dashboardId }, { archived }),
      );

      if (!undoing) {
        dispatch(
          addUndo({
            message: getTrashUndoMessage(dashboard.name, archived),
            action: () => dispatch(setArchivedDashboard(!archived, true)),
          }),
        );
      }

      dispatch(
        // @ts-expect-error Expected 0 arguments, but got 1. - rtk usaging in .js file is assuming wrong typing for function
        fetchDashboard({
          dashId: dashboardId,
          queryParam: null,
          options: { preserveParameters: true },
        }),
      );
    };
  },
);

// just using the entity action doesn't cause the dashboard to live update
// calling fetchDashboard ensures that the view updates with the last values
export const MOVE_DASHBOARD_TO_COLLECTION =
  "metabase/dashboard/MOVE_DASHBOARD_TO_COLLECTION";
export const moveDashboardToCollection = createThunkAction(
  MOVE_DASHBOARD_TO_COLLECTION,
  function (collection, forceArchive = undefined, undoing = false) {
    return async function (dispatch, getState) {
      const dashboardView = getState().dashboard;
      const dashboard = dashboardView.dashboardId
        ? dashboardView.dashboards?.[dashboardView.dashboardId]
        : null;

      if (!dashboard) {
        console.error(
          `${MOVE_DASHBOARD_TO_COLLECTION} failed due to no dashboard set in state`,
        );
        return;
      }

      const { id, archived, collection_id: current_collection_id } = dashboard;

      await dispatch(
        Dashboards.actions.update(
          { id },
          {
            collection_id: canonicalCollectionId(collection && collection.id),
            archived: forceArchive ?? false,
          },
        ),
      );

      if (!undoing) {
        dispatch(
          addUndo({
            subject: t`dashboard`,
            verb: t`moved`,
            action: () =>
              dispatch(
                moveDashboardToCollection(
                  { id: current_collection_id },
                  archived,
                  true,
                ),
              ),
          }),
        );
      }

      dispatch(
        // @ts-expect-error Expected 0 arguments, but got 1. - rtk usaging in .js file is assuming wrong typing for function
        fetchDashboard({
          dashId: id,
          queryParam: null,
          options: { preserveParameters: true },
        }),
      );
    };
  },
);
