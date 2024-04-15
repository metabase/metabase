import type {
  CreateUserResponse,
  CreateUserRequest,
  ListUsersRequest,
  ListUsersResponse,
  UpdatePasswordRequest,
  UserId,
  UpdateUserRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, invalidateTags, provideUserListTags } from "./tags";

export const userApi = Api.injectEndpoints({
  endpoints: builder => ({
    listUsers: builder.query<ListUsersResponse, ListUsersRequest | void>({
      query: body => ({
        method: "GET",
        url: "/api/user",
        body,
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
    createUser: builder.mutation<CreateUserResponse, CreateUserRequest>({
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
    deactivateUser: builder.mutation<void, { id: UserId }>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/user/${id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("user"), idTag("user", id)]),
    }),
    reactivateUser: builder.mutation<CreateUserResponse, { id: UserId }>({
      query: ({ id }) => ({
        method: "PUT",
        url: `/api/user/${id}/reactivate`,
      }),
      invalidatesTags: (_, error, { id }) =>
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
  useCreateUserMutation,
  useUpdatePasswordMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
} = userApi;
