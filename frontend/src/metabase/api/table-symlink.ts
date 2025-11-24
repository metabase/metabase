import type {
  CreateTableSymlinkRequest,
  ListTableSymlinksRequest,
  TableSymlink,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag, provideTableSymlinkListTags } from "./tags";

export const tableSymlinkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTableSymlinks: builder.query<TableSymlink[], ListTableSymlinksRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/table-symlink",
        params,
      }),
      providesTags: (symlinks = []) => provideTableSymlinkListTags(symlinks),
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
      invalidatesTags: (_symlink, error) =>
        invalidateTags(error, [listTag("table-symlink")]),
    }),
  }),
});

export const { useListTableSymlinksQuery, useCreateTableSymlinkMutation } =
  tableSymlinkApi;
