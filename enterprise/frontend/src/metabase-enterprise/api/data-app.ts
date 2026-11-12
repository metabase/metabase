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

export const dataAppApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDataApps: builder.query<DataApp[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/apps",
      }),
      providesTags: (apps = []) => [
        listTag("data-app"),
        ...apps.map((app) => idTag("data-app", app.slug)),
      ],
    }),
    getDataApp: builder.query<DataApp, string>({
      query: (slug) => ({
        method: "GET",
        url: `/api/ee/apps/${encodeURIComponent(slug)}`,
      }),
      providesTags: (_, __, slug) => [idTag("data-app", slug)],
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
      string
    >({
      query: (slug) => ({
        method: "GET",
        url: `/api/ee/apps/${encodeURIComponent(slug)}/group-permission-warnings`,
      }),
      providesTags: (_, __, slug) => [idTag("data-app", slug)],
    }),
    getDataAppGroups: builder.query<DataAppGroup[], string>({
      query: (slug) => ({
        method: "GET",
        url: `/api/ee/apps/${encodeURIComponent(slug)}/groups`,
      }),
      providesTags: (_, __, slug) => [idTag("data-app", slug)],
    }),
    addDataAppGroups: builder.mutation<DataAppGroup[], AddDataAppGroupsRequest>(
      {
        query: ({ slug, group_ids }) => ({
          method: "POST",
          url: `/api/ee/apps/${encodeURIComponent(slug)}/groups`,
          body: { group_ids },
        }),
        async onQueryStarted({ slug }, { dispatch, queryFulfilled }) {
          try {
            const { data: groups } = await queryFulfilled;

            // pending group-permission-warnings request delays tag invalidation; after a
            // successful add, replace the groups cache so new groups appear immediately.
            dispatch(
              dataAppApi.util.updateQueryData(
                "getDataAppGroups",
                slug,
                () => groups,
              ),
            );
          } catch {
            return;
          }
        },
        invalidatesTags: (_, error, { slug }) =>
          invalidateTags(error, [listTag("data-app"), idTag("data-app", slug)]),
      },
    ),
    removeDataAppGroup: builder.mutation<void, RemoveDataAppGroupRequest>({
      query: ({ slug, group_id }) => ({
        method: "DELETE",
        url: `/api/ee/apps/${encodeURIComponent(slug)}/groups/${group_id}`,
      }),

      async onQueryStarted({ slug, group_id }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;

          // pending group-permission-warnings request delays tag invalidation; after a
          // successful removal, filter the group from the cache so it disappears immediately.
          dispatch(
            dataAppApi.util.updateQueryData(
              "getDataAppGroups",
              slug,
              (groups) => groups.filter((group) => group.id !== group_id),
            ),
          );
        } catch {
          return;
        }
      },
      invalidatesTags: (_, error, { slug }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", slug)]),
    }),
    setDataAppEnabled: builder.mutation<DataApp, SetDataAppEnabledRequest>({
      query: ({ slug, enabled }) => ({
        method: "PUT",
        url: `/api/ee/apps/${encodeURIComponent(slug)}`,
        body: { enabled },
      }),
      invalidatesTags: (_, error, { slug }) =>
        invalidateTags(error, [listTag("data-app"), idTag("data-app", slug)]),
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
} = dataAppApi;
