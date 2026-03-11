import type {
  CreateCustomVizPluginRequest,
  CustomVizPlugin,
  CustomVizPluginRuntime,
  UpdateCustomVizPluginRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const customVizPluginApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listCustomVizPlugins: builder.query<CustomVizPluginRuntime[], void>({
      query: () => ({
        method: "GET",
        url: "/api/custom-viz-plugin/list",
      }),
      providesTags: (plugins = []) => [
        listTag("custom-viz-plugin"),
        ...plugins.map((plugin) => idTag("custom-viz-plugin", plugin.id)),
      ],
    }),
    listAllCustomVizPlugins: builder.query<CustomVizPlugin[], void>({
      query: () => ({
        method: "GET",
        url: "/api/custom-viz-plugin",
      }),
      providesTags: (plugins = []) => [
        listTag("custom-viz-plugin"),
        ...plugins.map((plugin) => idTag("custom-viz-plugin", plugin.id)),
      ],
    }),
    createCustomVizPlugin: builder.mutation<
      CustomVizPlugin,
      CreateCustomVizPluginRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/custom-viz-plugin",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("custom-viz-plugin")]),
    }),
    deleteCustomVizPlugin: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/custom-viz-plugin/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("custom-viz-plugin")]),
    }),
    updateCustomVizPlugin: builder.mutation<
      CustomVizPlugin,
      UpdateCustomVizPluginRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/custom-viz-plugin/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("custom-viz-plugin"),
          idTag("custom-viz-plugin", id),
        ]),
    }),
    refreshCustomVizPlugin: builder.mutation<CustomVizPlugin, number>({
      query: (id) => ({
        method: "POST",
        url: `/api/custom-viz-plugin/${id}/refresh`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("custom-viz-plugin"),
          idTag("custom-viz-plugin", id),
        ]),
    }),
  }),
});

export const {
  useListCustomVizPluginsQuery,
  useListAllCustomVizPluginsQuery,
  useCreateCustomVizPluginMutation,
  useDeleteCustomVizPluginMutation,
  useUpdateCustomVizPluginMutation,
  useRefreshCustomVizPluginMutation,
} = customVizPluginApi;
