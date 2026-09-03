import type {
  BulkTableRequest,
  PublishTablesResponse,
  TableId,
  TablePublishingInfo,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, tag } from "./tags";

export const tableApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTablePublishingInfo: builder.query<TablePublishingInfo | null, TableId>({
      query: (tableId) => ({
        method: "GET",
        url: `/api/ee/data-studio/table/${tableId}/publishing-info`,
      }),
      providesTags: (_, error, tableId) =>
        error ? [] : [idTag("table", tableId)],
    }),
    publishTables: builder.mutation<PublishTablesResponse, BulkTableRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/publish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
    unpublishTables: builder.mutation<void, BulkTableRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/unpublish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
  }),
});

export const {
  useGetTablePublishingInfoQuery,
  usePublishTablesMutation,
  useUnpublishTablesMutation,
} = tableApi;
