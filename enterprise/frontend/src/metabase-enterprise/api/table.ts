import type {
  DiscardTablesValuesRequest,
  EditTablesRequest,
  GetTableSelectionInfoRequest,
  GetTableSelectionInfoResponse,
  PublishTablesRequest,
  PublishTablesResponse,
  RescanTablesValuesRequest,
  SyncTablesSchemaRequest as SyncTablesSchemasRequest,
  UnpublishTablesRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, tag } from "./tags";

export const tableApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTableSelectionInfo: builder.query<
      GetTableSelectionInfoResponse,
      GetTableSelectionInfoRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/selection",
        body,
      }),
    }),
    editTables: builder.mutation<Record<string, never>, EditTablesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/edit",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("database"), tag("card")]),
    }),
    rescanTablesFieldValues: builder.mutation<void, RescanTablesValuesRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/data-studio/table/rescan-values`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    syncTablesSchemas: builder.mutation<void, SyncTablesSchemasRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/data-studio/table/sync-schema`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("table"),
          listTag("field"),
          listTag("field-values"),
          listTag("parameter-values"),
          tag("card"),
        ]),
    }),
    discardTablesFieldValues: builder.mutation<
      void,
      DiscardTablesValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/data-studio/table/discard-values`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    publishTables: builder.mutation<
      PublishTablesResponse,
      PublishTablesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/publish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
    unpublishTables: builder.mutation<void, UnpublishTablesRequest>({
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
  useGetTableSelectionInfoQuery,
  useEditTablesMutation,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
  useDiscardTablesFieldValuesMutation,
  usePublishTablesMutation,
  useUnpublishTablesMutation,
} = tableApi;
