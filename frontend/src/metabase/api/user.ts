import type {
  CreateUserRequest,
  GetUserKeyValueRequest,
  ListUsersRequest,
  ListUsersResponse,
  UpdatePasswordRequest,
  UpdateUserKeyValueRequest,
  UpdateUserRequest,
  User,
  UserId,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideUserListTags,
  provideUserTags,
} from "./tags";

export const userApi = Api.injectEndpoints({
  endpoints: builder => ({
    listUsers: builder.query<ListUsersResponse, ListUsersRequest>({
      query: params => ({
        method: "GET",
        url: "/api/user",
        params,
      }),
      providesTags: response =>
        response ? provideUserListTags(response.data) : [],
    }),
    listUserRecipients: builder.query<ListUsersResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/user/recipients",
      }),
      providesTags: response =>
        response ? provideUserListTags(response.data) : [],
    }),
    getUser: builder.query<User, UserId>({
      query: id => ({
        method: "GET",
        url: `/api/user/${id}`,
      }),
      providesTags: user => (user ? provideUserTags(user) : []),
    }),
    createUser: builder.mutation<User, CreateUserRequest>({
      query: body => ({
        method: "POST",
        url: "/api/user",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("user")]),
    }),
    updatePassword: builder.mutation<void, UpdatePasswordRequest>({
      query: ({ id, old_password, password }) => ({
        method: "PUT",
        url: `/api/user/${id}/password`,
        body: { old_password, password },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    deactivateUser: builder.mutation<void, UserId>({
      query: id => ({
        method: "DELETE",
        url: `/api/user/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    reactivateUser: builder.mutation<User, UserId>({
      query: id => ({
        method: "PUT",
        url: `/api/user/${id}/reactivate`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    updateUser: builder.mutation<User, UpdateUserRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/user/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    getKeyValue: builder.query<unknown, GetUserKeyValueRequest>({
      query: params => ({
        url: "/api/user-key-value",
        params,
      }),
      providesTags: (_, __, { key, context }) => [
        { type: "user-key-value", id: `${context}-${key}` },
      ],
    }),
    updateKeyValue: builder.mutation<unknown, UpdateUserKeyValueRequest>({
      query: body => ({
        method: "PUT",
        url: "/api/user-key-value",
        body,
      }),
      async onQueryStarted(
        { key, context, value },
        { dispatch, queryFulfilled },
      ) {
        const result = dispatch(
          userApi.util.updateQueryData(
            "getKeyValue",
            { key, context },
            () => value,
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          console.error("Unable to update user key value");
          result.undo();
        }
      },
    }),
  }),
});

export const {
  useListUsersQuery,
  useListUserRecipientsQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdatePasswordMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
  useUpdateUserMutation,
  useGetKeyValueQuery,
  useUpdateKeyValueMutation,
} = userApi;
