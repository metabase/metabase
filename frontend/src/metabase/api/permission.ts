import type {
  BaseGroupInfo,
  Group,
  GroupId,
  GroupListQuery,
  GroupUserMembership,
  Member,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  providePermissionMemberTags,
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
    getMemberships: builder.query<GroupUserMembership, void>({
      query: () => ({
        method: "GET",
        url: "/api/permissions/membership",
      }),
      providesTags: memberships => [
        ...providePermissionMemberTags(memberships ?? {}),
        listTag("permissions-member"),
      ],
    }),
    createMembership: builder.mutation<
      Member[],
      Pick<Member, "group_id" | "user_id">
    >({
      query: body => ({
        method: "POST",
        url: "/api/permissions/membership",
        body,
      }),
      invalidatesTags: (_, error, member) =>
        invalidateTags(error, [
          listTag("permissions-member"),
          idTag("permissions-group", member.group_id),
        ]),
    }),
    deleteMembership: builder.mutation<
      void,
      Pick<Member, "membership_id" | "group_id">
    >({
      query: ({ membership_id }) => ({
        method: "DELETE",
        url: `/api/permissions/membership/${membership_id}`,
      }),
      invalidatesTags: (_, error, member) =>
        invalidateTags(error, [
          listTag("permissions-member"),
          idTag("permissions-member", member.membership_id),
          listTag("permissions-group"),
          idTag("permissions-group", member.group_id),
        ]),
    }),
    updateMembership: builder.mutation<void, Member>({
      query: ({ membership_id, ...params }) => ({
        method: "PUT",
        url: `/api/permissions/membership/${membership_id}`,
        params,
      }),
      invalidatesTags: (_, error, member) =>
        invalidateTags(error, [
          idTag("permissions-member", member.membership_id),
          idTag("permissions-group", member.group_id),
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
