import type {
  CreateIndexRequest,
  CreateIndexResponse,
  DeleteIndexRequest,
  DeleteIndexResponse,
  GetIndexRequestArgs,
  IndexRequestDetails,
  ListTableIndexesResponse,
  PreviewIndexRequest,
  PreviewIndexResponse,
  TableId,
  UpdateIndexRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export const indexManagerApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTableIndexes: builder.query<ListTableIndexesResponse, TableId>({
      query: (id) => ({
        method: "GET",
        url: `/api/table/${id}/indexes`,
      }),
      providesTags: (_response, _error, id) => [
        idTag("table-indexes", String(id)),
        listTag("index-request"),
      ],
    }),

    previewTableIndex: builder.mutation<
      PreviewIndexResponse,
      PreviewIndexRequest
    >({
      query: ({ tableId, structured }) => ({
        method: "POST",
        url: `/api/table/${tableId}/indexes/preview`,
        body: { structured },
      }),
    }),

    createTableIndex: builder.mutation<CreateIndexResponse, CreateIndexRequest>(
      {
        query: ({ tableId, ...body }) => ({
          method: "POST",
          url: `/api/table/${tableId}/indexes`,
          body,
        }),
        invalidatesTags: (_response, error, { tableId }) =>
          invalidateTags(error, [
            idTag("table-indexes", String(tableId)),
            listTag("index-request"),
          ]),
      },
    ),

    getTableIndexRequest: builder.query<IndexRequestDetails, GetIndexRequestArgs>(
      {
        query: ({ tableId, requestId }) => ({
          method: "GET",
          url: `/api/table/${tableId}/indexes/requests/${requestId}`,
        }),
        providesTags: (_response, _error, { requestId }) => [
          idTag("index-request", requestId),
        ],
      },
    ),

    updateTableIndexRequest: builder.mutation<
      CreateIndexResponse,
      UpdateIndexRequest
    >({
      query: ({ tableId, requestId, ...body }) => ({
        method: "PUT",
        url: `/api/table/${tableId}/indexes/requests/${requestId}`,
        body,
      }),
      invalidatesTags: (_response, error, { tableId, requestId }) =>
        invalidateTags(error, [
          idTag("table-indexes", String(tableId)),
          idTag("index-request", requestId),
          listTag("index-request"),
        ]),
    }),

    deleteTableIndexRequest: builder.mutation<
      DeleteIndexResponse,
      DeleteIndexRequest
    >({
      query: ({ tableId, requestId }) => ({
        method: "DELETE",
        url: `/api/table/${tableId}/indexes/requests/${requestId}`,
      }),
      invalidatesTags: (_response, error, { tableId, requestId }) =>
        invalidateTags(error, [
          idTag("table-indexes", String(tableId)),
          idTag("index-request", requestId),
          listTag("index-request"),
          tag("table"),
        ]),
    }),
  }),
});

export const {
  useListTableIndexesQuery,
  usePreviewTableIndexMutation,
  useCreateTableIndexMutation,
  useGetTableIndexRequestQuery,
  useUpdateTableIndexRequestMutation,
  useDeleteTableIndexRequestMutation,
} = indexManagerApi;
