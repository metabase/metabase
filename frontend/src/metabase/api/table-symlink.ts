import type {
  CreateTableSymlinkRequest,
  ListTableSymlinksRequest,
  TableSymlink,
} from "metabase-types/api";

import { Api } from "./api";

export const tableSymlinkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTableSymlinks: builder.query<TableSymlink[], ListTableSymlinksRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/table-symlink",
        params,
      }),
    }),
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

export const { useListTableSymlinksQuery, useCreateTableSymlinkMutation } =
  tableSymlinkApi;
