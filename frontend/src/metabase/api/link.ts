import type {
  CreateLinkRequest,
} from "metabase-types/api";

import { Api } from "./api";

export const linkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    createLink: builder.mutation<unknown, CreateLinkRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/link`,
        body,
      }),
    }),
  }),
});

export const {
  useCreateLinkMutation,
} = linkApi;
