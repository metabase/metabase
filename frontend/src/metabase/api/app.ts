import type {
  App,
  AppId,
  CreateAppRequest,
  UpdateAppRequest,
} from "metabase-types/api/admin";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const appApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listApps: builder.query<App[], void>({
      query: () => `/api/app`,
      providesTags: (apps = []) => [
        listTag("app"),
        ...apps.map((app) => idTag("app", app.id)),
      ],
    }),
    getApp: builder.query<App, AppId>({
      query: (id) => `/api/app/${id}`,
      providesTags: (_, __, id) => [idTag("app", id)],
    }),
    createApp: builder.mutation<App, CreateAppRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/app`,
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("app")]),
    }),
    updateApp: builder.mutation<App, UpdateAppRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/app/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("app"), idTag("app", id)]),
    }),
    deleteApp: builder.mutation<void, AppId>({
      query: (id) => ({ method: "DELETE", url: `/api/app/${id}` }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("app"), idTag("app", id)]),
    }),
  }),
});

export const {
  useListAppsQuery,
  useGetAppQuery,
  useCreateAppMutation,
  useUpdateAppMutation,
  useDeleteAppMutation,
} = appApi;
