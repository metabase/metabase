import { PLUGIN_API } from "metabase/plugins";
import type {
  CopyDashboardRequest,
  CreateDashboardRequest,
  Dashboard,
  DashboardId,
  DashboardQueryMetadata,
  GetDashboardParameterValuesRequest,
  GetDashboardParameterValuesResponse,
  GetDashboardQueryMetadataRequest,
  GetDashboardRequest,
  GetEmbeddableDashboard,
  GetPublicDashboard,
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  ListDashboardsRequest,
  ListDashboardsResponse,
  SaveDashboardRequest,
  SearchDashboardParameterValuesRequest,
  UpdateDashboardPropertyRequest,
  UpdateDashboardRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideDashboardListTags,
  provideDashboardQueryMetadataTags,
  provideDashboardTags,
  provideParameterValuesTags,
  tag,
} from "./tags";

export const dashboardApi = Api.injectEndpoints({
  endpoints: (builder) => {
    const updateDashboardPropertyMutation = <
      Key extends keyof UpdateDashboardRequest,
    >() =>
      builder.mutation<Dashboard, UpdateDashboardPropertyRequest<Key>>({
        query: ({ id, ...body }) => ({
          method: "PUT",
          url: `/api/dashboard/${id}`,
          body,
        }),
        invalidatesTags: (_, error, { id }) =>
          invalidateTags(error, [listTag("dashboard"), idTag("dashboard", id)]),
      });

    return {
      listDashboards: builder.query<
        ListDashboardsResponse,
        ListDashboardsRequest | void
      >({
        query: (params) => ({
          method: "GET",
          url: "/api/dashboard",
          params,
        }),
        providesTags: (dashboards) =>
          dashboards ? provideDashboardListTags(dashboards) : [],
      }),
      getDashboard: builder.query<Dashboard, GetDashboardRequest>({
        query: ({ id, ignore_error }) => ({
          method: "GET",
          url: `/api/dashboard/${id}`,
          noEvent: ignore_error,
        }),
        providesTags: (dashboard) =>
          dashboard ? provideDashboardTags(dashboard) : [],
      }),
      getDashboardQueryMetadata: builder.query<
        DashboardQueryMetadata,
        GetDashboardQueryMetadataRequest
      >({
        query: ({ id, ...params }) => ({
          method: "GET",
          url: `/api/dashboard/${id}/query_metadata`,
          params,
        }),
        providesTags: (metadata) =>
          metadata ? provideDashboardQueryMetadataTags(metadata) : [],
      }),
      listDashboardItems: builder.query<
        ListCollectionItemsResponse,
        Omit<ListCollectionItemsRequest, "id"> & { id: DashboardId }
      >({
        query: ({ id, ...body }) => ({
          method: "GET",
          url: `/api/dashboard/${id}/items`,
          body,
        }),
      }),
      getDashboardParameterValues: builder.query<
        GetDashboardParameterValuesResponse,
        GetDashboardParameterValuesRequest
      >({
        query: ({ dashboard_id, parameter_id, ...params }) => ({
          method: "GET",
          url: PLUGIN_API.getDashboardParameterValuesUrl(
            dashboard_id,
            parameter_id,
          ),
          params,
        }),
        providesTags: (_data, _error, { parameter_id }) =>
          provideParameterValuesTags(parameter_id),
      }),
      searchDashboardParameterValues: builder.query<
        GetDashboardParameterValuesResponse,
        SearchDashboardParameterValuesRequest
      >({
        query: ({ dashboard_id, parameter_id, query, ...params }) => ({
          method: "GET",
          url: PLUGIN_API.getSearchDashboardParameterValuesUrl(
            dashboard_id,
            parameter_id,
            query,
          ),
          params,
        }),
        providesTags: (_data, _error, { parameter_id }) =>
          provideParameterValuesTags(parameter_id),
      }),
      createDashboard: builder.mutation<Dashboard, CreateDashboardRequest>({
        query: (body) => ({
          method: "POST",
          url: "/api/dashboard",
          body,
        }),
        invalidatesTags: (newDashboard, error) =>
          newDashboard
            ? [
                ...invalidateTags(error, [listTag("dashboard")]),
                ...invalidateTags(error, [
                  idTag("collection", newDashboard.collection_id ?? "root"),
                ]),
              ]
            : [],
      }),
      updateDashboard: builder.mutation<Dashboard, UpdateDashboardRequest>({
        query: ({ id, ...body }) => ({
          method: "PUT",
          url: `/api/dashboard/${id}`,
          body,
        }),
        invalidatesTags: (_, error, { id }) =>
          invalidateTags(error, [
            listTag("dashboard"),
            idTag("dashboard", id),
            tag("parameter-values"),
          ]),
      }),
      deleteDashboard: builder.mutation<void, DashboardId>({
        query: (id) => ({
          method: "DELETE",
          url: `/api/dashboard/${id}`,
        }),
        invalidatesTags: (_, error, id) =>
          invalidateTags(error, [listTag("dashboard"), idTag("dashboard", id)]),
      }),
      saveDashboard: builder.mutation<Dashboard, SaveDashboardRequest>({
        query: (body) => ({
          method: "POST",
          url: `/api/dashboard/save`,
          body,
        }),
        invalidatesTags: (_, error) =>
          invalidateTags(error, [
            listTag("dashboard"),
            tag("parameter-values"),
          ]),
      }),
      copyDashboard: builder.mutation<Dashboard, CopyDashboardRequest>({
        query: ({ id, ...body }) => ({
          method: "POST",
          url: `/api/dashboard/${id}/copy`,
          body,
        }),
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("dashboard")]),
      }),
      listEmbeddableDashboards: builder.query<GetEmbeddableDashboard[], void>({
        query: (params) => ({
          method: "GET",
          url: "/api/dashboard/embeddable",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map((res) => idTag("embed-dashboard", res.id)),
          listTag("embed-dashboard"),
        ],
      }),
      updateDashboardEnableEmbedding:
        updateDashboardPropertyMutation<"enable_embedding">(),
      updateDashboardEmbeddingParams:
        updateDashboardPropertyMutation<"embedding_params">(),
      listPublicDashboards: builder.query<GetPublicDashboard[], void>({
        query: (params) => ({
          method: "GET",
          url: "/api/dashboard/public",
          params,
        }),
        providesTags: (result = []) => [
          ...result.map((res) => idTag("public-dashboard", res.id)),
          listTag("public-dashboard"),
        ],
      }),
      createDashboardPublicLink: builder.mutation<
        Pick<Dashboard, "id"> & { uuid: Dashboard["public_uuid"] },
        Pick<Dashboard, "id">
      >({
        query: ({ id }) => ({
          method: "POST",
          url: `/api/dashboard/${id}/public_link`,
        }),
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("public-dashboard")]),
        transformResponse: ({ uuid }, _meta, { id }) => ({
          id,
          uuid,
        }),
      }),
      deleteDashboardPublicLink: builder.mutation<
        Pick<Dashboard, "id">,
        Pick<Dashboard, "id">
      >({
        query: ({ id }) => ({
          method: "DELETE",
          url: `/api/dashboard/${id}/public_link`,
        }),
        transformResponse: (_baseQueryReturnValue, _meta, { id }) => ({ id }),
        invalidatesTags: (_, error, { id }) =>
          invalidateTags(error, [
            listTag("public-dashboard"),
            idTag("public-dashboard", id),
          ]),
      }),
    };
  },
});

export const {
  useGetDashboardQuery,
  useLazyGetDashboardQuery,
  useGetDashboardQueryMetadataQuery,
  useListDashboardsQuery,
  useListDashboardItemsQuery,
  useCreateDashboardMutation,
  useUpdateDashboardMutation,
  useSaveDashboardMutation,
  useDeleteDashboardMutation,
  useCopyDashboardMutation,
  useListEmbeddableDashboardsQuery,
  useListPublicDashboardsQuery,
  useCreateDashboardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
  useUpdateDashboardEnableEmbeddingMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useGetDashboardParameterValuesQuery,
  useLazyGetDashboardParameterValuesQuery,
  useSearchDashboardParameterValuesQuery,
  useLazySearchDashboardParameterValuesQuery,
  endpoints: {
    getDashboard,
    deleteDashboardPublicLink,
    createDashboardPublicLink,
    updateDashboardEnableEmbedding,
    updateDashboardEmbeddingParams,
  },
} = dashboardApi;
