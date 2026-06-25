import type {
  CreateTableIndexRequest,
  ListTableIndexesRequest,
  ListTableIndexesResponse,
  TableIndexEntry,
  TableIndexRequest,
  TableIndexRequestId,
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
    listTableIndexes: builder.query<TableIndexEntry[], ListTableIndexesRequest>(
      {
        query: (params) => ({
          method: "GET",
          url: "/api/indexes",
          params,
        }),
        transformResponse: (response: ListTableIndexesResponse) =>
          response.data,
        providesTags: (indexes = []) => provideTableIndexListTags(indexes),
      },
    ),
    getTableIndex: builder.query<TableIndexRequest, TableIndexRequestId>({
      query: (id) => ({
        method: "GET",
        url: `/api/indexes/request/${id}`,
      }),
      providesTags: (index) => (index ? provideTableIndexTags(index) : []),
    }),
    createTableIndex: builder.mutation<
      TableIndexRequest,
      CreateTableIndexRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/indexes/request",
        body,
      }),
      invalidatesTags: (_index, error) =>
        invalidateTags(error, [listTag("table-index")]),
    }),
    updateTableIndex: builder.mutation<
      TableIndexRequest,
      UpdateTableIndexRequest
    >({
      query: ({ id, structured }) => ({
        method: "PUT",
        url: `/api/indexes/request/${id}`,
        body: { structured },
      }),
      invalidatesTags: (_index, error, { id }) =>
        invalidateTags(error, [
          listTag("table-index"),
          idTag("table-index", id),
        ]),
    }),
    deleteTableIndex: builder.mutation<void, TableIndexRequestId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/indexes/request/${id}`,
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
