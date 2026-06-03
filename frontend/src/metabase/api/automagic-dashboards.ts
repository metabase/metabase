import { updateMetadata } from "metabase/redux/metadata";
import { QueryMetadataSchema } from "metabase/schema";
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
import { handleQueryFulfilled } from "./utils/lifecycle";

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
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, QueryMetadataSchema)),
        ),
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
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, QueryMetadataSchema)),
        ),
    }),
    // Fetch a transient X-ray dashboard by the sub-path of an `/auto/dashboard/...`
    // URL (e.g. `table/1`). Used by Metabot to render an auto-generated dashboard
    // inline in the chat as a stack of its cards.
    getXrayDashboard: builder.query<Dashboard, string>({
      query: (subPath) => ({
        method: "GET",
        url: `/api/automagic-dashboards/${subPath}`,
      }),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, QueryMetadataSchema)),
        ),
    }),
  }),
});

export const {
  useGetXrayDashboardQueryMetadataQuery,
  useListDatabaseXraysQuery,
  useLazyGetXrayDashboardForModelQuery,
  useGetXrayDashboardQuery,
} = automagicDashboardsApi;
