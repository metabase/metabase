import type {
  CopyDashboardRequest,
  CreateDashboardRequest,
  Dashboard,
  DashboardId,
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
  provideDashboardTags,
} from "./tags";

export const dashboardApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDashboards: builder.query<
      ListDashboardsResponse,
      ListDashboardsRequest | void
    >({
      query: body => ({
        method: "GET",
        url: "/api/dashboard",
        body,
      }),
      providesTags: dashboards =>
        dashboards ? provideDashboardListTags() : [],
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
    createDashboard: builder.mutation<Dashboard, CreateDashboardRequest>({
      query: body => ({
        method: "POST",
        url: "/api/dashboard",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("dashboard")]),
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
  useCopyDashboardMutation,
  useCreateDashboardMutation,
  useDeleteDashboardMutation,
  useGetDashboardQuery,
  useListDashboardsQuery,
  useSaveDashboardMutation,
  useUpdateDashboardMutation,
} = dashboardApi;
