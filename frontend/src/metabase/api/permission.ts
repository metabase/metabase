import type {
  GroupId,
  Group,
  GroupListQuery,
  BaseGroupInfo,
} from "metabase-types/api";

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
    listPermissionsGroups: builder.query<GroupListQuery[], void>({
      query: () => ({
        method: "GET",
        url: "/api/permissions/group",
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
    createPermissionsGroup: builder.mutation<BaseGroupInfo, { name: string }>({
      query: body => ({
        method: "POST",
        url: "/api/permissions/group",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("permissions-group")]),
    }),
    updatePermissionsGroup: builder.mutation<BaseGroupInfo, BaseGroupInfo>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/permissions/group/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", id),
        ]),
    }),
    deletePermissionsGroup: builder.mutation<void, GroupId>({
      query: id => ({
        method: "DELETE",
        url: `/api/permissions/group/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", id),
        ]),
    }),
    clearGroupMembership: builder.mutation<void, GroupId>({
      query: id => ({
        method: "PUT",
        url: `/api/permissions/membership/${id}/clear`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", id),
        ]),
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
