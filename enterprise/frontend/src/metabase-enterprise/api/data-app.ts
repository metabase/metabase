import type {
  AddDataAppGroupsRequest,
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
  DataAppRepoStatus,
  RemoveDataAppGroupRequest,
  SetDataAppEnabledRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

// Repo status is a single resource; tag it so it and the app list both refresh
// when a sync changes things.
const REPO_STATUS_TAG = idTag("data-app", "REPO-STATUS");

type ListDataAppsOptions = { available?: boolean };

export const dataAppApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDataApps: builder.query<DataApp[], ListDataAppsOptions | void>({
      query: (options) => ({
        method: "GET",
        url: "/api/apps",
        params: options,
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
    getDataAppGroupPermissionWarnings: builder.query<
      DataAppGroupPermissionWarning[],
      string
    >({
      query: (name) => ({
        method: "GET",
        url: `/api/apps/${encodeURIComponent(name)}/group-permission-warnings`,
      }),
      providesTags: (_, __, name) => [idTag("data-app", name)],
    }),
    getDataAppGroups: builder.query<DataAppGroup[], string>({
      query: (name) => ({
        method: "GET",
        url: `/api/apps/${encodeURIComponent(name)}/groups`,
      }),
      providesTags: (_, __, name) => [idTag("data-app", name)],
    }),
    addDataAppGroups: builder.mutation<DataAppGroup[], AddDataAppGroupsRequest>(
      {
        query: ({ name, group_ids }) => ({
          method: "POST",
          url: `/api/apps/${encodeURIComponent(name)}/groups`,
          body: { group_ids },
        }),
        invalidatesTags: (_, error, { name }) =>
          invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
      },
    ),
    removeDataAppGroup: builder.mutation<void, RemoveDataAppGroupRequest>({
      query: ({ name, group_id }) => ({
        method: "DELETE",
        url: `/api/apps/${encodeURIComponent(name)}/groups/${group_id}`,
      }),
      invalidatesTags: (_, error, { name }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", name)]),
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
  useGetDataAppGroupsQuery,
  useGetDataAppGroupPermissionWarningsQuery,
  useAddDataAppGroupsMutation,
  useRemoveDataAppGroupMutation,
  useSetDataAppEnabledMutation,
  useDeleteDataAppMutation,
} = dataAppApi;
