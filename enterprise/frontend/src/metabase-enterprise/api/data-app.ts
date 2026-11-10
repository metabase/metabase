import type {
  AddDataAppGroupsRequest,
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
  DataAppId,
  DataAppRepoStatus,
  RemoveDataAppGroupRequest,
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
        url: "/api/ee/apps",
      }),
      providesTags: (apps = []) => [
        listTag("data-app"),
        ...apps.map((app) => idTag("data-app", app.id)),
      ],
    }),
    getDataAppBySlug: builder.query<DataApp, string>({
      query: (slug) => ({
        method: "GET",
        url: `/api/ee/apps/slug/${encodeURIComponent(slug)}`,
      }),
      providesTags: (app) => (app ? [idTag("data-app", app.id)] : []),
    }),
    getDataAppRepoStatus: builder.query<DataAppRepoStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/apps/repo-status",
      }),
      providesTags: () => [REPO_STATUS_TAG],
    }),
    getDataAppGroupPermissionWarnings: builder.query<
      DataAppGroupPermissionWarning[],
      DataAppId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/apps/${id}/group-permission-warnings`,
      }),
      providesTags: (_, __, id) => [idTag("data-app", id)],
    }),
    getDataAppGroups: builder.query<DataAppGroup[], DataAppId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/apps/${id}/groups`,
      }),
      providesTags: (_, __, id) => [idTag("data-app", id)],
    }),
    addDataAppGroups: builder.mutation<DataAppGroup[], AddDataAppGroupsRequest>(
      {
        query: ({ id, group_ids }) => ({
          method: "POST",
          url: `/api/ee/apps/${id}/groups`,
          body: { group_ids },
        }),
        async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
          try {
            const { data: groups } = await queryFulfilled;

            // pending group-permission-warnings request delays tag invalidation; after a
            // successful add, replace the groups cache so new groups appear immediately.
            dispatch(
              dataAppApi.util.updateQueryData(
                "getDataAppGroups",
                id,
                () => groups,
              ),
            );
          } catch {
            return;
          }
        },
        invalidatesTags: (_, error, { id }) =>
          invalidateTags(error, [listTag("data-app"), idTag("data-app", id)]),
      },
    ),
    removeDataAppGroup: builder.mutation<void, RemoveDataAppGroupRequest>({
      query: ({ id, group_id }) => ({
        method: "DELETE",
        url: `/api/ee/apps/${id}/groups/${group_id}`,
      }),

      async onQueryStarted({ id, group_id }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;

          // pending group-permission-warnings request delays tag invalidation; after a
          // successful removal, filter the group from the cache so it disappears immediately.
          dispatch(
            dataAppApi.util.updateQueryData("getDataAppGroups", id, (groups) =>
              groups.filter((group) => group.id !== group_id),
            ),
          );
        } catch {
          return;
        }
      },
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", id)]),
    }),
    setDataAppEnabled: builder.mutation<DataApp, SetDataAppEnabledRequest>({
      query: ({ id, enabled }) => ({
        method: "PUT",
        url: `/api/ee/apps/${id}`,
        body: { enabled },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", id)]),
    }),
  }),
});

export const {
  useListDataAppsQuery,
  useGetDataAppBySlugQuery,
  useGetDataAppRepoStatusQuery,
  useGetDataAppGroupsQuery,
  useGetDataAppGroupPermissionWarningsQuery,
  useAddDataAppGroupsMutation,
  useRemoveDataAppGroupMutation,
  useSetDataAppEnabledMutation,
} = dataAppApi;
