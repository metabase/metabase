import type {
  CreateTableIndexRequest,
  ListTableIndexesRequest,
  ListTableIndexesResponse,
  TableIndex,
  TableIndexId,
  UpdateTableIndexRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTableIndexListTags,
  provideTableIndexTags,
} from "./tags";

export const indexManagerApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTableIndexes: builder.query<TableIndex[], ListTableIndexesRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/indexes",
        params,
      }),
      transformResponse: (response: ListTableIndexesResponse) => response.data,
      providesTags: (indexes = []) => provideTableIndexListTags(indexes),
    }),
    getTableIndex: builder.query<TableIndex, TableIndexId>({
      query: (id) => ({
        method: "GET",
        url: `/api/indexes/${id}`,
      }),
      providesTags: (index) => (index ? provideTableIndexTags(index) : []),
    }),
    createTableIndex: builder.mutation<TableIndex, CreateTableIndexRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/indexes",
        body,
      }),
      invalidatesTags: (_index, error) =>
        invalidateTags(error, [listTag("table-index")]),
    }),
    updateTableIndex: builder.mutation<TableIndex, UpdateTableIndexRequest>({
      query: ({ id, structured }) => ({
        method: "PUT",
        url: `/api/indexes/${id}`,
        body: { structured },
      }),
      invalidatesTags: (_index, error, { id }) =>
        invalidateTags(error, [
          listTag("table-index"),
          idTag("table-index", id),
        ]),
    }),
    deleteTableIndex: builder.mutation<void, TableIndexId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/indexes/${id}`,
      }),
      invalidatesTags: (_index, error, id) =>
        invalidateTags(error, [
          listTag("table-index"),
          idTag("table-index", id),
        ]),
    }),
  }),
});

export const {
  useListTableIndexesQuery,
  useGetTableIndexQuery,
  useLazyGetTableIndexQuery,
  useCreateTableIndexMutation,
  useUpdateTableIndexMutation,
  useDeleteTableIndexMutation,
} = indexManagerApi;
