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
import { handleQueryFulfilled } from "./utils/lifecycle";

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
    getCurrentUser: builder.query<User, void>({
      query: () => ({
        method: "GET",
        url: "/api/user/current",
      }),
      // Deliberately no `user` tag: this cache entry is the app's current-user
      // state, kept in sync by the explicit patches in the mutations below. A
      // `user` id tag would evict it whenever any user mutation invalidates
      // that tag, forcing refetches the old `currentUser` reducer never did.
      //
      // Like `getSessionProperties`, this mirrors the lifetime of the redux
      // slice it replaced: once loaded, never garbage-collected (the endpoint
      // takes no argument, so this is one immortal entry). `refetchCurrentUser`
      // and logout's `resetApiState` still replace/clear it.
      keepUnusedDataFor: Infinity,
    }),
    createUser: builder.mutation<User, CreateUserRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/user",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("user"),
          listTag("tenant"),
          listTag("permissions-group"),
        ]),
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
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        // keep the cached current user in sync when the user updates themselves
        handleQueryFulfilled(queryFulfilled, (user) =>
          dispatch(
            userApi.util.updateQueryData(
              "getCurrentUser",
              undefined,
              (draft) => {
                if (draft?.id === user.id) {
                  Object.assign(draft, user);
                }
              },
            ),
          ),
        ),
    }),
    getPasswordResetUrl: builder.mutation<
      { password_reset_url: string },
      UserId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/user/${id}/password-reset-url`,
      }),
    }),
    listUserAttributes: builder.query<string[], void>({
      query: () => "/api/mt/user/attributes",
      providesTags: (response) => (response ? [listTag("user")] : []),
    }),
    updateUserModalQbnewb: builder.mutation<void, UserId>({
      query: (id) => ({
        method: "PUT",
        url: `/api/user/${id}/modal/qbnewb`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("user", id)]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
        } catch {
          return;
        }
        dispatch(
          userApi.util.updateQueryData("getCurrentUser", undefined, (draft) => {
            if (draft?.id === id) {
              draft.is_qbnewb = false;
            }
          }),
        );
      },
    }),
  }),
});

/**
 * Fetch the current user into the `getCurrentUser` cache (`getUser` reads come
 * from it) unless it's already there.
 */
export const loadCurrentUser = () =>
  userApi.endpoints.getCurrentUser.initiate();

/**
 * Force a refetch of the current user from non-React code. Dispatch it:
 * `dispatch(refetchCurrentUser())`.
 */
export const refetchCurrentUser = () =>
  userApi.endpoints.getCurrentUser.initiate(undefined, { forceRefetch: true });

export const {
  useListUsersQuery,
  useListUserRecipientsQuery,
  useGetUserQuery,
  useGetCurrentUserQuery,
  useLazyGetCurrentUserQuery,
  useCreateUserMutation,
  useUpdatePasswordMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
  useUpdateUserMutation,
  useGetPasswordResetUrlMutation,
  useListUserAttributesQuery,
  useUpdateUserModalQbnewbMutation,
} = userApi;
