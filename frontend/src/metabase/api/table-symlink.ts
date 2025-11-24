import type {
  CreateTableSymlinkRequest,
  TableSymlink,
} from "metabase-types/api";

import { Api } from "./api";

export const tableSymlinkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    createTableSymlink: builder.mutation<
      TableSymlink,
      CreateTableSymlinkRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/table-symlink",
        body,
      }),
    }),
  }),
});

export const { useCreateTableSymlinkMutation } = tableSymlinkApi;
