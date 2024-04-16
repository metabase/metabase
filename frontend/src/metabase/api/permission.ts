import type { GroupId, Group } from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  listTag,
  invalidateTags,
  providePermissionsGroupListTags,
  providePermissionsGroupTags,
} from "./tags";

export const permissionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listPermissionsGroups: builder.query<Group[], void>({
      query: body => ({
        method: "GET",
        url: "/api/permissions/group",
        body,
      }),
      providesTags: (groups = []) => providePermissionsGroupListTags(groups),
    }),
    getPermissionsGroup: builder.query<Group, GroupId>({
      query: id => ({
        method: "GET",
        url: `/api/permissions/group/${id}`,
      }),
      providesTags: group => (group ? providePermissionsGroupTags(group) : []),
    }),
    createPermissionsGroup: builder.mutation<unknown, unknown>({
      query: body => ({
        method: "POST",
        url: "/api/permissions/group",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("permissions-group")]),
    }),
    updatePermissionsGroup: builder.mutation<unknown, any>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/permissions/group/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("permissions-group", id)]),
    }),
    deletePermissionsGroup: builder.mutation<unknown, GroupId>({
      query: id => ({
        method: "DELETE",
        url: `/api/permissions/group/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("permissions-group", id)]),
    }),
    clearGroupMembership: builder.mutation<unknown, GroupId>({
      query: id => ({
        method: "PUT",
        url: `/api/permissions/membership/${id}/clear`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("permissions-group", id)]),
    }),
  }),
});

export const {
  useListPermissionsGroupsQuery,
  useGetPermissionsGroupQuery,
  useCreatePermissionsGroupMutation,
  useUpdatePermissionsGroupMutation,
  useClearGroupMembershipMutation,
  useDeletePermissionsGroupMutation,
} = permissionApi;
