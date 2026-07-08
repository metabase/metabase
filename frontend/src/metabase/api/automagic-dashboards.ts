import { updateMetadata } from "metabase/redux/metadata";
import { QueryMetadataSchema } from "metabase/schema";
import type {
  Dashboard,
  DashboardQueryMetadata,
  DatabaseId,
  DatabaseXray,
  GetXrayDashboardQueryMetadataRequest,
  GetXrayDashboardRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideDashboardQueryMetadataTags,
  provideDatabaseCandidateListTags,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

// `subPath` is embedded raw into the request URL (its slashes are real path
// separators) and originates from the `/auto/dashboard/*` route — i.e. it is
// user-controlled. Reject `.`/`..` path segments so a crafted URL can't walk
// out of the automagic-dashboards route into another same-origin endpoint.
export function hasUnsafeXraySubPath(subPath: string): boolean {
  const [path] = subPath.split("?");
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

export const automagicDashboardsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getXrayDashboard: builder.query<Dashboard, GetXrayDashboardRequest>({
      queryFn: async (
        { subPath, ...params },
        _api,
        _extraOptions,
        baseQuery,
      ) => {
        if (hasUnsafeXraySubPath(subPath)) {
          return {
            error: {
              status: "CUSTOM_ERROR",
              error: `Refusing to fetch x-ray dashboard for unsafe path: ${subPath}`,
            },
          };
        }
        const { data, error } = await baseQuery({
          method: "GET",
          url: `/api/automagic-dashboards/${subPath}`,
          params,
        });
        return error ? { error } : { data: data as Dashboard };
      },
    }),
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
  }),
});

export const {
  useGetXrayDashboardQueryMetadataQuery,
  useListDatabaseXraysQuery,
  useLazyGetXrayDashboardForModelQuery,
  useLazyGetXrayDashboardQuery,
} = automagicDashboardsApi;
