import { t } from "ttag";

import {
  dashboardApi,
  useGetDashboardQuery,
  useListDashboardsQuery,
} from "metabase/api/dashboard";
import { getCollectionType } from "metabase/entities/collections/utils";

import { createEntity, entityCompatibleQuery } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 */
export const Dashboards = createEntity({
  name: "dashboards",
  nameOne: "dashboard",
  path: "/api/dashboard",

  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameOne: t`dashboard`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameMany: t`dashboards`,

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery: useGetDashboardQuery,
    }),
    useListQuery: useListDashboardsQuery,
  }),

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.listDashboards,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        { ...entityQuery, ignore_error: options?.noEvent },
        dispatch,
        dashboardApi.endpoints.getDashboard,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.createDashboard,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.updateDashboard,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(
        id,
        dispatch,
        dashboardApi.endpoints.deleteDashboard,
      ),
    save: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.saveDashboard,
      ),
  },

  actions: {
    save: (dashboard) => async (dispatch) => {
      const savedDashboard = await entityCompatibleQuery(
        dashboard,
        dispatch,
        dashboardApi.endpoints.saveDashboard,
      );
      dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
      return {
        type: "metabase/entities/dashboards/SAVE_DASHBOARD",
        payload: savedDashboard,
      };
    },
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});
