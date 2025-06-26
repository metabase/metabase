import type {
  Dashboard,
  DashboardQueryMetadata,
  DatabaseId,
  DatabaseXray,
  GetXrayDashboardQueryMetadataRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideDashboardQueryMetadataTags,
  provideDatabaseCandidateListTags,
} from "./tags";
export const automagicDashboardsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getXrayDashboardQueryMetadata: builder.query<
      DashboardQueryMetadata,
      GetXrayDashboardQueryMetadataRequest
    >({
      query: ({ entity, entityId, ...params }) => ({
        method: "GET",
        url: `/api/automagic-dashboards/${entity}/${entityId}/query_metadata`,
        params,
      }),
      providesTags: (metadata) =>
        metadata ? provideDashboardQueryMetadataTags(metadata) : [],
    }),
    listDatabaseXrays: builder.query<DatabaseXray[], DatabaseId>({
      query: (id) => `/api/automagic-dashboards/database/${id}/candidates`,
      providesTags: (candidates = []) =>
        provideDatabaseCandidateListTags(candidates),
    }),
    getXrayDashboardForModel: builder.query<
      Dashboard,
      { modelId: number; dashboard_load_id?: number }
    >({
      query: ({ modelId, dashboard_load_id }) => {
        const params = dashboard_load_id ? { dashboard_load_id } : undefined;
        return {
          method: "GET",
          url: `/api/automagic-dashboards/model/${modelId}`,
          params,
        };
      },
    }),
  }),
});

export const {
  useGetXrayDashboardQueryMetadataQuery,
  useListDatabaseXraysQuery,
  useLazyGetXrayDashboardForModelQuery,
} = automagicDashboardsApi;
