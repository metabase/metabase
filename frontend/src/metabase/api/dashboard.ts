import type {
  CopyDashboardRequest,
  CreateDashboardRequest,
  Dashboard,
  DashboardId,
  DashboardQueryMetadata,
  GetDashboardQueryMetadataRequest,
  GetDashboardRequest,
  ListDashboardsRequest,
  ListDashboardsResponse,
  SaveDashboardRequest,
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
} from "./tags";

export const dashboardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDashboards: builder.query<
      ListDashboardsResponse,
      ListDashboardsRequest | void
    >({
      query: params => ({
        method: "GET",
        url: "/api/dashboard",
        params,
      }),
      providesTags: dashboards =>
        dashboards ? provideDashboardListTags(dashboards) : [],
    }),
    getDashboard: builder.query<Dashboard, GetDashboardRequest>({
      query: ({ id, ignore_error }) => ({
        method: "GET",
        url: `/api/dashboard/${id}`,
        noEvent: ignore_error,
      }),
      providesTags: dashboard =>
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
      providesTags: metadata =>
        metadata ? provideDashboardQueryMetadataTags(metadata) : [],
    }),
    createDashboard: builder.mutation<Dashboard, CreateDashboardRequest>({
      query: body => ({
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
        invalidateTags(error, [listTag("dashboard"), idTag("dashboard", id)]),
    }),
    deleteDashboard: builder.mutation<void, DashboardId>({
      query: id => ({
        method: "DELETE",
        url: `/api/dashboard/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("dashboard"), idTag("dashboard", id)]),
    }),
    saveDashboard: builder.mutation<Dashboard, SaveDashboardRequest>({
      query: body => ({
        method: "POST",
        url: `/api/dashboard/save`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("dashboard")]),
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
  }),
});

export const {
  useGetDashboardQuery,
  useGetDashboardQueryMetadataQuery,
  useListDashboardsQuery,
  useCreateDashboardMutation,
  useUpdateDashboardMutation,
  useSaveDashboardMutation,
  useDeleteDashboardMutation,
  useCopyDashboardMutation,
} = dashboardApi;
