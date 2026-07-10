import type {
  DataApp,
  DataAppRepoStatus,
  SetDataAppEnabledRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

// Repo status is a single resource; tag it so it and the app list both refresh
// when a sync changes things.
const REPO_STATUS_TAG = idTag("data-app", "REPO-STATUS");

export const dataAppApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDataApps: builder.query<DataApp[], void>({
      query: () => ({
        method: "GET",
        url: "/api/apps",
      }),
      providesTags: (apps = []) => [
        listTag("data-app"),
        ...apps.map((app) => idTag("data-app", app.name)),
      ],
    }),
    getDataApp: builder.query<DataApp, string>({
      query: (name) => ({
        method: "GET",
        url: `/api/apps/${encodeURIComponent(name)}`,
      }),
      providesTags: (_, __, name) => [idTag("data-app", name)],
    }),
    getDataAppRepoStatus: builder.query<DataAppRepoStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/apps/repo-status",
      }),
      providesTags: () => [REPO_STATUS_TAG],
    }),
    setDataAppEnabled: builder.mutation<DataApp, SetDataAppEnabledRequest>({
      query: ({ name, enabled }) => ({
        method: "PUT",
        url: `/api/apps/${encodeURIComponent(name)}`,
        body: { enabled },
      }),
      invalidatesTags: (_, error, { name }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
    }),
    deleteDataApp: builder.mutation<void, string>({
      query: (name) => ({
        method: "DELETE",
        url: `/api/apps/${encodeURIComponent(name)}`,
      }),
      invalidatesTags: (_, error, name) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
    }),
  }),
});

export const {
  useListDataAppsQuery,
  useGetDataAppQuery,
  useGetDataAppRepoStatusQuery,
  useSetDataAppEnabledMutation,
  useDeleteDataAppMutation,
} = dataAppApi;
