import type {
  BaseGroupInfo,
  CreateMembershipRequest,
  DatabaseId,
  Group,
  GroupId,
  GroupListQuery,
  ListUserMembershipsResponse,
  Membership,
  PermissionsGraph,
  UpdatePermissionsGraphRequest,
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
    getPermissionsGraph: builder.query<PermissionsGraph, void>({
      query: () => ({
        method: "GET",
        url: "/api/permissions/graph",
      }),
    }),
    getGroupPermissionsGraph: builder.query<PermissionsGraph, GroupId>({
      query: (groupId) => ({
        method: "GET",
        url: `/api/permissions/graph/group/${groupId}`,
      }),
    }),
    getDatabasePermissionsGraph: builder.query<PermissionsGraph, DatabaseId>({
      query: (databaseId) => ({
        method: "GET",
        url: `/api/permissions/graph/db/${databaseId}`,
      }),
    }),
    updatePermissionsGraph: builder.mutation<
      PermissionsGraph,
      UpdatePermissionsGraphRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/permissions/graph",
        body,
      }),
    }),
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
  useGetPermissionsGraphQuery,
  useGetGroupPermissionsGraphQuery,
  useGetDatabasePermissionsGraphQuery,
  useUpdatePermissionsGraphMutation,
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
