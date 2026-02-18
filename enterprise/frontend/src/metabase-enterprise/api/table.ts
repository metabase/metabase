import type {
  BulkTableSelection,
  PublishTablesResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, tag } from "./tags";

export const tableApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    publishTables: builder.mutation<PublishTablesResponse, BulkTableSelection>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-studio/table/publish-tables",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("card"), tag("collection")]),
    }),
    unpublishTables: builder.mutation<void, BulkTableSelection>({
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

export const { usePublishTablesMutation, useUnpublishTablesMutation } =
  tableApi;
