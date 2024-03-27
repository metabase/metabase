import { injectTableMetadata } from "metabase-lib/v1/metadata/utils/tables";
import type {
  Table,
  TableId,
  TableMetadataQuery,
  VirtualTableMetadata,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, tag } from "./tags";

export const tableApi = Api.injectEndpoints({
  endpoints: builder => ({
    fetchMetadata: builder.query<
      // Table when id is ConcreteTableId
      // VirtualTableMetadata when id is VirtualTableId
      Table | VirtualTableMetadata,
      TableMetadataQuery & { id: TableId }
    >({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/table/${id}/query_metadata`,
        body,
      }),
      providesTags: (_response, _error, { id }) => [
        idTag("table-query-metadata", id),
      ],
      transformResponse: injectTableMetadata,
    }),
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/rescan_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/discard_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
  }),
});

export const {
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
