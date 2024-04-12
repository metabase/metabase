import type {
  CreateUserResponse,
  CreateUserRequest,
  ListUsersRequest,
  ListUsersResponse,
  UpdatePasswordRequest,
  UserId,
} from "metabase-types/api";

import { Api } from "./api";
// import { listTag, invalidateTags } from "./tags";

export const userApi = Api.injectEndpoints({
  endpoints: builder => ({
    listUsers: builder.query<ListUsersResponse, ListUsersRequest | null>({
      query: body => ({
        method: "GET",
        url: "/api/user",
        body,
      }),
      // FIXME: providesTags is needed
    }),
    listUserRecipients: builder.query({
      query: () => ({
        method: "GET",
        url: "/api/user/recipients",
      }),
      // FIXME: is providesTags needed ??
    }),
    createUser: builder.mutation<CreateUserResponse, CreateUserRequest>({
      query: body => ({
        method: "POST",
        url: "/api/user",
        body,
      }),
      // FIXME: invalidatesTags is needed
    }),
    updatePassword: builder.mutation<void, UpdatePasswordRequest>({
      query: ({ id, old_password, password }) => ({
        method: "PUT",
        url: `/api/user/${id}/password`,
        body: { old_password, password },
      }),
      // FIXME: invalidatesTags is maybe needed?
    }),
    deactivateUser: builder.query<void, { id: UserId }>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/user/${id}`,
      }),
    }),
    reactivateUser: builder.query<CreateUserResponse, { id: UserId }>({
      query: ({ id }) => ({
        method: "PUT",
        url: `/api/user/${id}/reactivate`,
      }),
    }),
  }),
});

export const {
  useListUsersQuery,
  useListUserRecipientsQuery,
  useCreateUserMutation,
  useUpdatePasswordMutation,
  useDeactivateUserQuery,
  useReactivateUserQuery,
} = userApi;
