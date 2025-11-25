import type {
  BaseGroupInfo,
  CreateMembershipRequest,
  Group,
  GroupId,
  GroupListQuery,
  ListUserMembershipsResponse,
  Membership,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  providePermissionsGroupListTags,
  providePermissionsGroupTags,
} from "./tags";

export const permissionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listPermissionsGroups: builder.query<
      GroupListQuery[],
      { tenancy?: "external" | "internal" } | undefined
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/permissions/group",
        params,
      }),
      providesTags: (groups = []) => providePermissionsGroupListTags(groups),
    }),
    getPermissionsGroup: builder.query<Group, GroupId>({
      query: (id) => ({
        method: "GET",
        url: `/api/permissions/group/${id}`,
      }),
      providesTags: (group) =>
        group ? providePermissionsGroupTags(group) : [],
    }),
    createPermissionsGroup: builder.mutation<
      BaseGroupInfo,
      Pick<BaseGroupInfo, "name" | "is_tenant_group">
    >({
      query: (body) => ({
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
      query: (id) => ({
        method: "DELETE",
        url: `/api/permissions/group/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", id),
        ]),
    }),
    listUserMemberships: builder.query<ListUserMembershipsResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/permissions/membership`,
      }),
      providesTags: () => [listTag("permissions-group")],
    }),
    createMembership: builder.mutation<void, CreateMembershipRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/permissions/membership`,
        body,
      }),
      invalidatesTags: (_, error, membership) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", membership.group_id),
          listTag("user"),
          idTag("user", membership.user_id),
        ]),
    }),
    updateMembership: builder.mutation<void, Membership>({
      query: (membership) => ({
        method: "PUT",
        url: `/api/permissions/membership/${membership.membership_id}`,
        body: membership,
      }),
      invalidatesTags: (_, error, membership) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", membership.group_id),
          listTag("user"),
          idTag("user", membership.user_id),
        ]),
    }),
    deleteMembership: builder.mutation<void, Membership>({
      query: (membership) => ({
        method: "DELETE",
        url: `/api/permissions/membership/${membership.membership_id}`,
      }),
      invalidatesTags: (_, error, membership) =>
        invalidateTags(error, [
          listTag("permissions-group"),
          idTag("permissions-group", membership.group_id),
          listTag("user"),
          idTag("user", membership.user_id),
        ]),
    }),
    clearGroupMembership: builder.mutation<void, GroupId>({
      query: (id) => ({
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
  useListUserMembershipsQuery,
  useCreateMembershipMutation,
  useUpdateMembershipMutation,
  useDeleteMembershipMutation,
} = permissionApi;
