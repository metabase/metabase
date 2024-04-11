import type {
  CreateUserResponse,
  CreateUserRequest,
  UpdatePasswordRequest,
} from "metabase-types/api";

import { Api } from "./api";
// import { listTag, invalidateTags } from "./tags";

export const userApi = Api.injectEndpoints({
  endpoints: builder => ({
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
  }),
});

export const { useCreateUserMutation, useUpdatePasswordMutation } = userApi;
