import { STORE_TEMPORARY_PASSWORD } from "metabase/admin/people/events";
import { userUpdated } from "metabase/redux/user";
import type {
  CreateUserRequest,
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
  endpoints: (builder) => ({
    listUsers: builder.query<ListUsersResponse, ListUsersRequest | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/user",
        params,
      }),
      providesTags: (response) =>
        response ? provideUserListTags(response.data) : [],
    }),
    listUserRecipients: builder.query<ListUsersResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/user/recipients",
      }),
      providesTags: (response) =>
        response ? provideUserListTags(response.data) : [],
    }),
    getUser: builder.query<User, UserId>({
      query: (id) => ({
        method: "GET",
        url: `/api/user/${id}`,
      }),
      providesTags: (user) => (user ? provideUserTags(user) : []),
    }),
    createUser: builder.mutation<User, CreateUserRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/user",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("user")]),
      onQueryStarted: async (request, { dispatch, queryFulfilled }) => {
        if (request.password) {
          const { data: user } = await queryFulfilled;
          const payload = { id: user.id, password: request.password };
          dispatch({ type: STORE_TEMPORARY_PASSWORD, payload });
        }
      },
    }),
    updatePassword: builder.mutation<void, UpdatePasswordRequest>({
      query: ({ id, old_password, password }) => ({
        method: "PUT",
        url: `/api/user/${id}/password`,
        body: { old_password, password },
      }),
      onQueryStarted: async ({ id, password }, { dispatch }) => {
        dispatch({ type: STORE_TEMPORARY_PASSWORD, payload: { id, password } });
      },
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    deactivateUser: builder.mutation<void, UserId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/user/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("user"),
          idTag("user", id),
          listTag("permissions-group"),
        ]),
    }),
    reactivateUser: builder.mutation<User, UserId>({
      query: (id) => ({
        method: "PUT",
        url: `/api/user/${id}/reactivate`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("user"),
          idTag("user", id),
          listTag("permissions-group"),
        ]),
    }),
    updateUser: builder.mutation<User, UpdateUserRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/user/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
      onQueryStarted: async (_request, { dispatch, queryFulfilled }) => {
        // used to keep current user state in sync
        const { data: user } = await queryFulfilled;
        dispatch(userUpdated(user));
      },
    }),
    listUserAttributes: builder.query<string[], void>({
      query: () => "/api/mt/user/attributes",
      providesTags: (response) => (response ? [listTag("user")] : []),
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
  useListUserAttributesQuery,
} = userApi;
