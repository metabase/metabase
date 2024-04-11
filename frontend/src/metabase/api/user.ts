import type { CreateUserResponse, CreateUserRequest } from "metabase-types/api";

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
  }),
});

export const { useCreateUserMutation } = userApi;
