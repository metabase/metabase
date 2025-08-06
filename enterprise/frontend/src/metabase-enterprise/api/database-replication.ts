import { invalidateTags, tag } from "metabase/api/tags";
import type { DatabaseId } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export interface PreviewDatabaseReplicationResponse {
  free_quota: any;
  total_estimated_row_count: any;
  can_set_replication: boolean;
  all_quotas: any;
  tables_without_pk: { schema: string; name: string }[];
}

export const DatabaseReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    previewDatabaseReplication: builder.mutation<
      PreviewDatabaseReplicationResponse,
      {
        databaseId: DatabaseId;
        schemaFilters?: { type: "include" | "exclude"; pattern: string }[];
      }
    >({
      query: ({ databaseId, ...body }) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}/preview`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    createDatabaseReplication: builder.mutation<
      void,
      {
        databaseId: DatabaseId;
        schemaFilters?: { type: "include" | "exclude"; pattern: string }[];
      }
    >({
      query: ({ databaseId, ...body }) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteDatabaseReplication: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "DELETE",
        url: `/api/ee/database-replication/connection/${databaseId}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  usePreviewDatabaseReplicationMutation,
  useCreateDatabaseReplicationMutation,
  useDeleteDatabaseReplicationMutation,
} = DatabaseReplicationApi;
