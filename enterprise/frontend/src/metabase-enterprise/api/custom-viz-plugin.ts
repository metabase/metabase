import type {
  CreateCustomVizPluginRequest,
  CreateDevCustomVizPluginRequest,
  CustomVizPlugin,
  CustomVizPluginId,
  CustomVizPluginRuntime,
  ReplaceCustomVizPluginBundleRequest,
  UpdateCustomVizPluginRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const customVizPluginApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCustomVizPlugins: builder.query<CustomVizPluginRuntime[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/custom-viz-plugin/list",
      }),
      providesTags: (plugins = []) => [
        listTag("custom-viz-plugin"),
        ...plugins.map((plugin) => idTag("custom-viz-plugin", plugin.id)),
      ],
    }),
    listAllCustomVizPlugins: builder.query<CustomVizPlugin[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/custom-viz-plugin",
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
      query: ({ file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          method: "POST",
          url: "/api/ee/custom-viz-plugin",
          body: { formData },
          formData: true,
          fetch: true,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("custom-viz-plugin")]),
    }),
    replaceCustomVizPluginBundle: builder.mutation<
      CustomVizPlugin,
      ReplaceCustomVizPluginBundleRequest
    >({
      query: ({ id, file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          method: "PUT",
          url: `/api/ee/custom-viz-plugin/${id}/bundle`,
          body: { formData },
          formData: true,
          fetch: true,
        };
      },
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("custom-viz-plugin"),
          idTag("custom-viz-plugin", id),
        ]),
    }),
    createDevCustomVizPlugin: builder.mutation<
      CustomVizPlugin,
      CreateDevCustomVizPluginRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/custom-viz-plugin/dev",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("custom-viz-plugin")]),
    }),
    deleteCustomVizPlugin: builder.mutation<void, CustomVizPluginId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/custom-viz-plugin/${id}`,
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
        url: `/api/ee/custom-viz-plugin/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("custom-viz-plugin"),
          idTag("custom-viz-plugin", id),
        ]),
    }),
    setCustomVizPluginDevUrl: builder.mutation<
      { dev_bundle_url: string | null },
      { id: CustomVizPluginId; dev_bundle_url: string | null }
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/custom-viz-plugin/${id}/dev-url`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("custom-viz-plugin"),
          idTag("custom-viz-plugin", id),
        ]),
    }),
    refreshCustomVizPlugin: builder.mutation<
      CustomVizPlugin,
      CustomVizPluginId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/custom-viz-plugin/${id}/refresh`,
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
  useCreateDevCustomVizPluginMutation,
  useDeleteCustomVizPluginMutation,
  useUpdateCustomVizPluginMutation,
  useRefreshCustomVizPluginMutation,
  useReplaceCustomVizPluginBundleMutation,
  useSetCustomVizPluginDevUrlMutation,
} = customVizPluginApi;
