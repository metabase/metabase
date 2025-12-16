import type { GroupId, GroupsPermissions, PermissionsGraph } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

type GetDataPermissionsGraphRequest = void;

type GetDataPermissionsGraphForGroupRequest = {
  groupId: GroupId;
};

type UpdateDataPermissionsGraphRequest = {
  revision: number;
  groups: GroupsPermissions;
};

export const dataPermissionsApi = Api.injectEndpoints({
  endpoints: builder => ({
    getDataPermissionsGraph: builder.query<
      PermissionsGraph,
      GetDataPermissionsGraphRequest
    >({
      query: () => ({
        method: "GET",
        url: "/api/permissions/graph",
      }),
      providesTags: () => [tag("data-permissions")],
    }),

    getDataPermissionsGraphForGroup: builder.query<
      PermissionsGraph,
      GetDataPermissionsGraphForGroupRequest
    >({
      query: ({ groupId }) => ({
        method: "GET",
        url: "/api/permissions/graph",
        params: { group_id: groupId },
      }),
      providesTags: (_result, _error, { groupId }) => [
        tag("data-permissions"),
        { type: "data-permissions" as const, id: groupId },
      ],
    }),

    updateDataPermissionsGraph: builder.mutation<
      PermissionsGraph,
      UpdateDataPermissionsGraphRequest
    >({
      query: ({ revision, groups }) => ({
        method: "PUT",
        url: "/api/permissions/graph",
        body: { revision, groups },
      }),
      invalidatesTags: (_result, error) =>
        invalidateTags(error, [tag("data-permissions")]),
    }),
  }),
});

export const {
  useGetDataPermissionsGraphQuery,
  useGetDataPermissionsGraphForGroupQuery,
  useUpdateDataPermissionsGraphMutation,
} = dataPermissionsApi;
