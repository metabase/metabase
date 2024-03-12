import Dashboards from "metabase/entities/dashboards";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import type {
  Dashboard,
  DashboardId,
  DashboardParameterValuesRequestInput,
  FieldId,
  FieldReference,
} from "metabase-types/api";

import { Api } from "./api";
import { providesList, DASHBOARD_TAG } from "./tags";

let dashboardEndpointsPrefix = "/api";

export function setPublicDashboardEndpoints() {
  dashboardEndpointsPrefix = "/api/public";
}

export function setEmbedDashboardEndpoints() {
  if (!IS_EMBED_PREVIEW) {
    dashboardEndpointsPrefix = "/api/embed";
  }
}

export const dashboardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDashboards: builder.query<Dashboard[], void>({
      queryFn: async (_, api) => {
        try {
          await api.dispatch(Dashboards.actions.fetchList());
          return { data: Dashboards.selectors.getList(api.getState()) };
        } catch (error) {
          return { error };
        }
      },
      providesTags: result => providesList(result, DASHBOARD_TAG),
    }),
    getDashboard: builder.query<Dashboard, DashboardId>({
      queryFn: async (id, api) => {
        try {
          await api.dispatch(Dashboards.actions.fetch({ id }));
          return {
            data: Dashboards.selectors.getObject(api.getState(), {
              entityId: id,
            }),
          };
        } catch (error) {
          return { error };
        }
      },
      providesTags: (_, __, id) => [{ type: DASHBOARD_TAG, id }],
    }),
    createDashboard: builder.mutation<any, any>({
      queryFn: async (input, api) => {
        try {
          await api.dispatch(Dashboards.actions.create(input));
          return { data: undefined };
        } catch (error) {
          return { error };
        }
      },
      // invalidatesTags not needed as entity will do invalidation for us
    }),
    updateDashboard: builder.mutation<any, any>({
      queryFn: async (input, api) => {
        try {
          await api.dispatch(Dashboards.actions.update(input));
          return { data: undefined };
        } catch (error) {
          return { error };
        }
      },
      // invalidatesTags not needed as entity will do invalidation for us
    }),
    deleteDashboard: builder.mutation<void, DashboardId>({
      queryFn: async (id, api) => {
        try {
          await api.dispatch(Dashboards.actions.delete(id));
          return { data: undefined };
        } catch (error) {
          return { error };
        }
      },
      // invalidatesTags not needed as entity will do invalidation for us
    }),
    createPublicDashboardLink: builder.mutation<
      { uuid: Dashboard["public_uuid"] },
      DashboardId
    >({
      query: id => ({
        method: "POST",
        url: `/api/dashboard/${id}/public_link`,
      }),
      invalidatesTags: (_, __, id) => [{ type: DASHBOARD_TAG, id }],
    }),
    deletePublicDashboardLink: builder.mutation<void, DashboardId>({
      query: id => ({
        method: "DELETE",
        url: `/api/dashboard/${id}/public_link`,
      }),
      invalidatesTags: (_, __, id) => [{ type: DASHBOARD_TAG, id }],
    }),
    dashboardParameterValues: builder.query<
      { values: any; has_more_values: any },
      DashboardParameterValuesRequestInput
    >({
      query: ({ dashId, paramId }) =>
        `${dashboardEndpointsPrefix}/dashboard/${dashId}/params/${paramId}/values`,
    }),
    dashboardParameterSearch: builder.query<
      { values: any; has_more_values: any },
      DashboardParameterValuesRequestInput
    >({
      query: ({ dashId, paramId, query }) =>
        `${dashboardEndpointsPrefix}/dashboard/${dashId}/params/${paramId}/search/${query}`,
    }),
    validFilterFields: builder.query<
      Record<FieldId, FieldId[]>,
      {
        filtered: Array<FieldId | FieldReference>;
        filtering: Array<FieldId | FieldReference>;
      }
    >({
      query: params => ({ method: "GET", params }),
    }),
    listPublic: builder.query<any, any>({
      query: () => "/api/dashboard/public",
    }),
    listEmbeddable: builder.query<any, any>({
      query: () => "/api/dashboard/embeddable",
    }),
    // TODO cardQuery: POST( "/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query",),
    // TODO cardQueryPivot: POST( "/api/dashboard/pivot/:dashboardId/dashcard/:dashcardId/card/:cardId/query",),
    // TODO / not in use - exportCardQuery: POST( "/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query/:exportFormat",),
  }),
});

export const {
  useListDashboardsQuery,
  useGetDashboardQuery,
  useCreatePublicDashboardLinkMutation,
  useDeletePublicDashboardLinkMutation,
} = dashboardApi;
