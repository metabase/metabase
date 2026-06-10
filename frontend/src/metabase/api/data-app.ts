import type {
  CreateDataAppRequest,
  DataApp,
  UpdateDataAppRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const dataAppApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listDataApps: builder.query<DataApp[], void>({
      query: () => ({
        method: "GET",
        url: "/api/data-app",
      }),
      providesTags: (apps = []) => [
        listTag("data-app"),
        ...apps.map((app) => idTag("data-app", app.name)),
      ],
    }),
    getDataApp: builder.query<DataApp, string>({
      query: (name) => ({
        method: "GET",
        url: `/api/data-app/${encodeURIComponent(name)}`,
      }),
      providesTags: (_, __, name) => [idTag("data-app", name)],
    }),
    createDataApp: builder.mutation<DataApp, CreateDataAppRequest>({
      query: ({ name, display_name, file }) => {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("display_name", display_name);
        formData.append("file", file);
        return {
          method: "POST",
          url: "/api/data-app",
          body: formData,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("data-app")]),
    }),
    updateDataApp: builder.mutation<DataApp, UpdateDataAppRequest>({
      query: ({ name, display_name, file }) => {
        const formData = new FormData();
        if (display_name !== undefined) {
          formData.append("display_name", display_name);
        }
        if (file) {
          formData.append("file", file);
        }
        return {
          method: "PUT",
          url: `/api/data-app/${encodeURIComponent(name)}`,
          body: formData,
        };
      },
      invalidatesTags: (_, error, { name }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
    }),
    deleteDataApp: builder.mutation<void, string>({
      query: (name) => ({
        method: "DELETE",
        url: `/api/data-app/${encodeURIComponent(name)}`,
      }),
      invalidatesTags: (_, error, name) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
    }),
  }),
});

export const {
  useListDataAppsQuery,
  useGetDataAppQuery,
  useCreateDataAppMutation,
  useUpdateDataAppMutation,
  useDeleteDataAppMutation,
} = dataAppApi;
