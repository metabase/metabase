import { updateCurrentUser } from "metabase/redux/user";
import type {
  CreateUserRequest,
  CurrentUser,
  ListUsersRequest,
  ListUsersResponse,
  UpdatePasswordRequest,
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
    getCurrentUser: builder.query<CurrentUser, void>({
      query: () => ({
        method: "GET",
        url: "/api/user/current",
      }),
      providesTags: user => (user ? provideUserTags(user) : []),
      onCacheEntryAdded: async (_, { dispatch, cacheDataLoaded }) => {
        // lots of stuff relies on the currentUser global state, so let's also update it there
        const response = await cacheDataLoaded;
        if (response.data) {
          dispatch(updateCurrentUser(response.data));
        }
      },
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
  }),
});

export const {
  useListUsersQuery,
  useListUserRecipientsQuery,
  useGetUserQuery,
  useGetCurrentUserQuery,
  useCreateUserMutation,
  useUpdatePasswordMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
  useUpdateUserMutation,
} = userApi;
