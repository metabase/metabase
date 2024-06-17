import type {
  DatabaseXray,
  DatabaseId,
  DashboardQueryMetadata,
  GetXrayDashboardQueryMetadataRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideDashboardQueryMetadataTags,
  provideDatabaseCandidateListTags,
} from "./tags";

export const automagicDashboardsApi = Api.injectEndpoints({
  endpoints: builder => ({
    getXrayDashboardQueryMetadata: builder.query<
      DashboardQueryMetadata,
      GetXrayDashboardQueryMetadataRequest
    >({
      query: ({ entity, entityId }) =>
        `/api/automagic-dashboards/${entity}/${entityId}/query_metadata`,
      providesTags: metadata =>
        metadata ? provideDashboardQueryMetadataTags(metadata) : [],
      keepUnusedDataFor: Infinity,
    }),
    listDatabaseXrays: builder.query<DatabaseXray[], DatabaseId>({
      query: id => `/api/automagic-dashboards/database/${id}/candidates`,
      providesTags: (candidates = []) =>
        provideDatabaseCandidateListTags(candidates),
    }),
  }),
});

export const {
  useGetXrayDashboardQueryMetadataQuery,
  useListDatabaseXraysQuery,
} = automagicDashboardsApi;
